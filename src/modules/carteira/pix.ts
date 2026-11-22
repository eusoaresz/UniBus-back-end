import type Stripe from "stripe";
import type { z } from "zod";
import { Prisma } from "../../../generated/prisma";
import { prisma } from "../../../lib/prisma";
import { HttpError } from "../../shared/errors/http-error";
import { executarTransacao, lancar } from "./carteira.financeiro";
import type { recargaSchema } from "./carteira.schemas";
import { registrarNotificacao } from "../notificacoes/notificacoes.service";
import { ambienteStripe, pagamentosHabilitados, stripe } from "./stripe";

const centavos = (valor: Prisma.Decimal) => valor.mul(100).toNumber();

export async function solicitarPix(carteiraId: string, usuarioId: string, dados: z.infer<typeof recargaSchema>) {
  if (!pagamentosHabilitados()) throw new HttpError(503, "Recarga Pix integrada ainda não habilitada");
  // PaymentIntent aceita até oito dígitos em centavos, independentemente do limite do banco local.
  if (new Prisma.Decimal(dados.valor).gt("999999.99")) throw new HttpError(400, "Valor excede o limite da integração");
  const ambiente = ambienteStripe();
  const r = await executarTransacao(prisma, async tx => {
    const estudante = await tx.estudante.findUnique({ where: { usuarioId }, include: { carteira: true } });
    if (!estudante || !["APROVADO", "SUSPENSO"].includes(estudante.statusCadastro) || estudante.carteira?.id !== carteiraId)
      throw new HttpError(403, "Cadastro sem permissão para recarga");
    const chaveIdempotencia = `recarga:${usuarioId}:${dados.chaveIdempotencia}`;
    const anterior = await tx.recarga.findUnique({ where: { chaveIdempotencia }, include: { pagamento: true } });
    if (anterior) {
      if (!anterior.valor.eq(dados.valor) || anterior.carteiraId !== carteiraId || !anterior.pagamento || anterior.pagamento.ambiente !== ambiente)
        throw new HttpError(409, "Chave utilizada com outra recarga ou ambiente");
      return anterior;
    }
    return tx.recarga.create({ data: { carteiraId, valor: dados.valor, formaPagamento: "PIX", solicitadaPorId: usuarioId,
      chaveIdempotencia, pagamento: { create: { ambiente } } }, include: { pagamento: true } });
  });
  const p = r.pagamento!;
  if (p.revisaoNecessaria) throw new HttpError(409, "Pagamento requer revisão do operador");
  if (!p.referencia && Date.now() - p.criadoEm.getTime() >= 23 * 3600000)
    throw new HttpError(409, "Criação sem confirmação. Consulte o operador antes de gerar outro pagamento");
  let pagamento: Stripe.PaymentIntent;
  try { pagamento = p.referencia ? await stripe.consultar(p.referencia) : await stripe.criar(centavos(r.valor), r.id, p.chaveCriacao); }
  catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, "Não foi possível confirmar a cobrança. Repita com a mesma chave de idempotência");
  }
  await sincronizarPagamento(pagamento);
  return consultarPix(r.id, usuarioId);
}

export async function consultarPix(id: string, usuarioId: string) {
  const r = await prisma.recarga.findFirst({ where: { id, carteira: { estudante: { usuarioId } } }, include: { pagamento: true } });
  if (!r?.pagamento) throw new HttpError(404, "Recarga Pix não encontrada");
  const p = r.pagamento;
  if (p.ambiente !== ambienteStripe()) throw new HttpError(409, "Recarga pertence a outro ambiente");
  let segredoCliente: string | null = null;
  if (r.status === "PENDENTE" && p.referencia && !p.revisaoNecessaria) {
    const atual = await stripe.consultar(p.referencia);
    await sincronizarPagamento(atual);
    if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(atual.status)) segredoCliente = atual.client_secret;
  }
  const atual = await prisma.recarga.findUniqueOrThrow({ where: { id }, include: { pagamento: true } });
  return { id: atual.id, valor: atual.valor.toFixed(2), status: atual.status, provedor: "STRIPE",
    statusPagamento: atual.pagamento!.status, revisaoNecessaria: atual.pagamento!.revisaoNecessaria,
    segredoCliente: atual.pagamento!.revisaoNecessaria ? null : segredoCliente };
}

export async function sincronizarPagamento(p: Stripe.PaymentIntent) {
  return executarTransacao(prisma, async tx => {
    const recargaId = p.metadata?.recargaId;
    // IDs externos e metadados são não confiáveis até cruzar com a cobrança local.
    if (!recargaId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recargaId)) return { ignorado: true };
    const r = await tx.recarga.findUnique({ where: { id: recargaId }, include: { pagamento: true, credito: true,
      carteira: { select: { saldo: true, estudante: { select: { usuarioId: true } } } } } });
    if (!r?.pagamento) return { ignorado: true };
    const pagamento = r.pagamento;
    if (pagamento.provedor !== "STRIPE" || pagamento.ambiente !== ambienteStripe() || p.livemode !== (pagamento.ambiente === "producao") ||
      p.metadata.chaveCriacao !== pagamento.chaveCriacao || (pagamento.referencia && pagamento.referencia !== p.id) ||
      p.currency !== "brl" || p.amount !== centavos(r.valor) || p.payment_method_types.length !== 1 || p.payment_method_types[0] !== "pix" ||
      (p.status === "succeeded" && p.amount_received !== centavos(r.valor))) throw new HttpError(409, "Pagamento diverge da recarga registrada");
    const cobranca = typeof p.latest_charge === "object" ? p.latest_charge : null;
    if (p.status === "succeeded" && (!cobranca || !cobranca.paid || cobranca.currency !== "brl" || cobranca.amount !== centavos(r.valor)))
      throw new HttpError(409, "Confirmação de pagamento incompleta");
    const devolvido = !!cobranca && (cobranca.refunded || cobranca.amount_refunded > 0 || cobranca.disputed);
    const excedeSaldo = p.status === "succeeded" && r.status === "PENDENTE" && r.carteira.saldo.plus(r.valor).gt("99999999.99");
    if (devolvido || excedeSaldo || (p.status === "succeeded" && !["PENDENTE", "APROVADA"].includes(r.status))) {
      await tx.pagamento.update({ where: { recargaId }, data: { referencia: p.id, status: p.status,
        revisaoNecessaria: true, motivoRevisao: devolvido ? "DEVOLUCAO_OU_DISPUTA" : excedeSaldo ? "LIMITE_SALDO" : "PAGAMENTO_APOS_CANCELAMENTO" } });
      const operadores = await tx.usuario.findMany({ where: { perfil: "OPERADOR", status: "ATIVA" }, select: { id: true } });
      for (const op of operadores) await registrarNotificacao(tx, { usuarioId: op.id, tema: "CARTEIRA", tipo: "RECARGA",
        chaveDeduplicacao: `revisao-pix:${recargaId}:${op.id}`, titulo: "Recarga exige revisão", mensagem: `Verifique a recarga ${recargaId} e seu pagamento na Stripe.` });
      return { revisaoNecessaria: true };
    }
    await tx.pagamento.update({ where: { recargaId }, data: { referencia: p.id,
      status: r.status === "APROVADA" ? "succeeded" : p.status,
      proximaConsultaEm: new Date(Date.now() + (p.status === "succeeded" ? 24 * 3600000 : 5 * 60000)) } });
    if (pagamento.revisaoNecessaria) return { revisaoNecessaria: true };
    if (p.status === "succeeded" && r.status === "PENDENTE") {
      await lancar(tx, { carteiraId: r.carteiraId, valor: r.valor, tipo: "RECARGA", recargaId, realizadaPorId: null,
        motivo: "Crédito automático confirmado pela Stripe", chaveIdempotencia: `stripe:${p.id}` });
      await tx.recarga.update({ where: { id: recargaId }, data: { status: "APROVADA", identificadorPagamento: p.id,
        analisadaEm: new Date(), analisadaPorId: null, observacaoAnalise: "Confirmação automática Stripe" } });
      await registrarNotificacao(tx, { usuarioId: r.carteira.estudante.usuarioId, tema: "CARTEIRA", tipo: "RECARGA",
        chaveDeduplicacao: `analise-recarga:${recargaId}`, titulo: "Recarga confirmada", mensagem: `Sua recarga de R$ ${r.valor.toFixed(2)} foi confirmada.` });
    } else if (p.status === "canceled" && r.status === "PENDENTE") {
      await tx.recarga.update({ where: { id: recargaId }, data: { status: "CANCELADA", observacaoAnalise: "Pagamento cancelado na Stripe" } });
    }
    return { recebido: true };
  });
}

export async function receberEvento(corpo: Buffer, assinatura: string) {
  const evento = stripe.verificarEvento(corpo, assinatura);
  let referencia: string | null = null;
  if (["payment_intent.succeeded", "payment_intent.canceled", "payment_intent.payment_failed", "payment_intent.processing"].includes(evento.type)) {
    referencia = (evento.data.object as Stripe.PaymentIntent).id;
  } else if (["charge.refunded", "charge.dispute.created", "charge.dispute.closed"].includes(evento.type)) {
    const objeto = evento.data.object as Stripe.Charge | Stripe.Dispute;
    referencia = typeof objeto.payment_intent === "string" ? objeto.payment_intent : objeto.payment_intent?.id ?? null;
  }
  if (!referencia) return { ignorado: true };
  return sincronizarPagamento(await stripe.consultar(referencia));
}

export async function conciliarPagamentos() {
  if (!process.env.STRIPE_SECRET_KEY) return;
  const pendentes = await prisma.pagamento.findMany({ where: { ambiente: ambienteStripe(), referencia: { not: null },
    OR: [{ recarga: { status: "PENDENTE" } }, { recarga: { status: "APROVADA" }, criadoEm: { gte: new Date(Date.now() - 90 * 86400000) } }],
    revisaoNecessaria: false, proximaConsultaEm: { lte: new Date() } },
    orderBy: { proximaConsultaEm: "asc" }, take: 20 });
  for (const p of pendentes) {
    await prisma.pagamento.update({ where: { recargaId: p.recargaId }, data: { proximaConsultaEm: new Date(Date.now() + 5 * 60000) } });
    try { await sincronizarPagamento(await stripe.consultar(p.referencia!)); }
    catch { console.error("Falha ao conciliar pagamento", { recargaId: p.recargaId }); }
  }
}

export function iniciarPagamentos() {
  let executando = false;
  const executar = async () => {
    if (executando) return;
    executando = true;
    try { await conciliarPagamentos(); } catch { console.error("Falha na conciliação de pagamentos"); }
    finally { executando = false; }
  };
  void executar();
  setInterval(() => void executar(), 30000).unref();
}
