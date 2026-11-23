import type { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { debitar } from "../carteira/carteira.financeiro";
import { inscricaoSchema, inscricaoDuplaSchema } from "./operacao.schemas";
import { transacao, trechoTx, exigir, notificar, cancelarTx, participacaoSelect, type Tx } from "./operacao.shared";

export async function elegivel(tx: Tx, estudanteId: string, agora: Date) {
  const e = await tx.estudante.findUnique({ where: { id: estudanteId }, include: {
    usuario: { select: { id: true, status: true, perfil: true, bloqueioDisciplinarAte: true } }, carteira: true,
  } });
  if (!e || e.statusCadastro !== "APROVADO" || e.usuario.status !== "ATIVA" || e.usuario.perfil !== "ESTUDANTE" || !e.carteira) return null;
  if (e.usuario.bloqueioDisciplinarAte && e.usuario.bloqueioDisciplinarAte > agora) return null;
  const impedimento = await tx.advertencia.findFirst({ where: { estudanteId, numero: { gte: 2 }, liberadaEm: null,
    semestre: { inicio: { lte: agora }, fim: { gt: agora } } } });
  return impedimento ? null : e;
}

export async function promoverTx(tx: Tx, trechoId: string, agora: Date, operador?: { id: string; motivo: string }, solicitanteId?: string) {
  const t = await trechoTx(tx, trechoId);
  if (!["ABERTO", "FECHADO"].includes(t.status) || t.iniciadoEm || agora >= t.saidaPrevistaEm) return;
  if (!operador && (agora > t.limiteConfirmacaoEm || t.inscricoesSuspensas)) return;
  const fila = await tx.participacaoTrecho.findMany({ where: { trechoId, status: "EM_ESPERA" }, orderBy: { ordemFila: "asc" } });
  for (const p of fila) {
    const ocupacao = await tx.participacaoTrecho.groupBy({ by: ["alocacao"], where: { trechoId, status: "CONFIRMADA" }, _count: { _all: true } });
    const usados = (a: "VEICULO" | "EXTRA") => ocupacao.find((o) => o.alocacao === a)?._count._all ?? 0;
    const alocacao = usados("VEICULO") < (t.capacidade ?? 0) ? "VEICULO"
      : usados("EXTRA") < (t.capacidadeExtra ?? 0) ? "EXTRA" : null;
    if (!alocacao) break;
    const e = await elegivel(tx, p.estudanteId, agora);
    if (!e) continue;
    if (e.carteira!.saldo.minus(t.tarifa).lt(-20)) {
      await notificar(tx, e.usuarioId, `saldo-fila:${p.id}:${p.cicloConfirmacao}`, "Regularize seu saldo", "Sua inscrição permanece na fila, mas o saldo não permite confirmar a passagem.");
      continue;
    }
    const ciclo = p.cicloConfirmacao + 1;
    const tardia = Boolean(operador) && agora > t.limiteConfirmacaoEm;
    await tx.participacaoTrecho.update({ where: { id: p.id }, data: {
      status: "CONFIRMADA", alocacao, cicloConfirmacao: ciclo, confirmadaEm: agora,
      confirmacaoTardia: tardia,
      origemConfirmacao: operador ? "OPERADOR" : solicitanteId === e.id ? "ESTUDANTE" : "AUTOMATICA", confirmadaPorId: operador?.id ?? null,
      motivoExcecao: operador?.motivo ?? null, canceladaEm: null,
      limiteEstornoEm: tardia ? new Date(Math.min(agora.getTime() + 30 * 60000, t.saidaPrevistaEm.getTime())) : t.limiteCancelamentoEm,
    } });
    await debitar(tx, { participacaoId: p.id, cicloConfirmacao: ciclo, valor: t.tarifa.toFixed(2),
      realizadaPorId: operador?.id ?? e.usuarioId, chaveIdempotencia: `confirmacao:${p.id}:${ciclo}` });
    await tx.alteracaoParticipacao.create({ data: { participacaoId: p.id, acao: operador ? "INCLUSAO_EXCEPCIONAL" : "CONFIRMACAO",
      realizadaPorId: operador?.id ?? null, motivo: operador?.motivo,
      dadosAnteriores: { status: p.status }, dadosNovos: { status: "CONFIRMADA", alocacao, ciclo } } });
    await notificar(tx, e.usuarioId, `confirmacao:${p.id}:${ciclo}`, "Presença confirmada", `Vaga confirmada. Passagem de R$ ${t.tarifa.toFixed(2)} debitada.`);
  }
}

async function inscreverTx(tx: Tx, trechoId: string, usuarioId: string, dados: z.infer<typeof inscricaoSchema>, agora: Date, operador?: { id: string; motivo: string }) {
  const t = await trechoTx(tx, trechoId);
  if (operador) exigir(["ABERTO", "FECHADO"].includes(t.status) && !t.iniciadoEm && agora < t.saidaPrevistaEm, "Trecho indisponível para inclusão excepcional");
  else exigir(t.status === "ABERTO" && !t.inscricoesSuspensas && agora <= t.limiteConfirmacaoEm && agora < t.saidaPrevistaEm, "Prazo de inscrição encerrado ou trecho indisponível");
  const e = await tx.estudante.findUnique({ where: { usuarioId }, select: { id: true } });
  exigir(e && await elegivel(tx, e.id, agora), "Cadastro sem permissão para novas confirmações", 403);
  const paradas = await tx.paradaTrecho.findMany({ where: { trechoId, ativa: true, id: { in: [dados.origemId, dados.destinoId] } } });
  const origem = paradas.find((p) => p.id === dados.origemId);
  const destino = paradas.find((p) => p.id === dados.destinoId);
  exigir(origem && destino && origem.ordem < destino.ordem, "Origem e destino devem pertencer ao trecho e respeitar a ordem", 400);
  let p = await tx.participacaoTrecho.findUnique({ where: { trechoId_estudanteId: { trechoId, estudanteId: e.id } } });
  if (p && ["CONFIRMADA", "EM_ESPERA"].includes(p.status)) {
    exigir(p.origemId === dados.origemId && p.destinoId === dados.destinoId, "Cancele a participação antes de alterar os pontos");
  } else if (p) {
    const [sequencia] = await tx.$queryRaw<{ valor: bigint }[]>`SELECT nextval(pg_get_serial_sequence('"ParticipacaoTrecho"', 'ordemFila')) AS valor`;
    p = await tx.participacaoTrecho.update({ where: { id: p.id }, data: { ...dados, status: "EM_ESPERA", ordemFila: sequencia.valor,
      alocacao: null, confirmadaEm: null, canceladaEm: null, limiteEstornoEm: null } });
  } else {
    p = await tx.participacaoTrecho.create({ data: { trechoId, estudanteId: e.id, ...dados } });
  }
  if (p.status === "EM_ESPERA") {
    await tx.alteracaoParticipacao.create({ data: { participacaoId: p.id, acao: "ENTRADA_FILA", realizadaPorId: operador?.id ?? usuarioId, motivo: operador?.motivo,
      dadosNovos: { status: "EM_ESPERA", ordemFila: p.ordemFila.toString() } } });
    await promoverTx(tx, trechoId, agora, operador, e.id);
  }
  return tx.participacaoTrecho.findUniqueOrThrow({ where: { id: p.id }, select: participacaoSelect });
}

export const inscrever = (id: string, usuarioId: string, dados: z.infer<typeof inscricaoSchema>) =>
  transacao((tx) => inscreverTx(tx, id, usuarioId, dados, new Date()));

export const inscreverDupla = (usuarioId: string, dados: z.infer<typeof inscricaoDuplaSchema>) => transacao(async (tx) => {
  const trechos = await tx.trechoViagem.findMany({ where: { id: { in: dados.trechos.map((t) => t.trechoId) } } });
  exigir(trechos.length === 2 && trechos[0].viagemId === trechos[1].viagemId && trechos[0].sentido !== trechos[1].sentido,
    "Selecione ida e volta da mesma viagem", 400);
  const resultado = [];
  const agora = new Date();
  for (const entrada of dados.trechos) resultado.push(await inscreverTx(tx, entrada.trechoId, usuarioId, entrada, agora));
  exigir(resultado.every((p) => p.status === "CONFIRMADA"), "Ida e volta não puderam ser confirmadas juntas. Solicite separadamente para entrar em espera");
  return resultado;
});

export function incluirOperador(trechoId: string, operadorId: string, dados: { estudanteId: string; origemId: string; destinoId: string; motivo: string }) {
  return transacao(async (tx) => {
    const estudante = await tx.estudante.findUnique({ where: { id: dados.estudanteId }, select: { usuarioId: true } });
    exigir(estudante, "Estudante não encontrado", 404);
    return inscreverTx(tx, trechoId, estudante.usuarioId, { origemId: dados.origemId, destinoId: dados.destinoId }, new Date(), { id: operadorId, motivo: dados.motivo });
  });
}

export function confirmarOperador(trechoId: string, estudanteId: string, operadorId: string, motivo: string) {
  return transacao(async (tx) => {
    const p = await tx.participacaoTrecho.findUnique({ where: { trechoId_estudanteId: { trechoId, estudanteId } } });
    exigir(p, "Inscreva o estudante na fila antes da confirmação excepcional", 404);
    if (p.status === "CONFIRMADA") return tx.participacaoTrecho.findUniqueOrThrow({ where: { id: p.id }, select: participacaoSelect });
    exigir(p.status === "EM_ESPERA", "Participação fora da fila");
    await promoverTx(tx, trechoId, new Date(), { id: operadorId, motivo });
    const atual = await tx.participacaoTrecho.findUniqueOrThrow({ where: { id: p.id }, select: participacaoSelect });
    exigir(atual.status === "CONFIRMADA", "Não há vaga/saldo ou há estudantes elegíveis antes na fila");
    return atual;
  });
}

export function cancelarPropria(id: string, usuarioId: string) {
  return transacao(async (tx) => {
    const p = await tx.participacaoTrecho.findFirst({ where: { id, estudante: { usuarioId } }, include: { trecho: true } });
    exigir(p, "Participação não encontrada", 404);
    const agora = new Date();
    if (["CANCELADA", "EXPIRADA"].includes(p.status)) return tx.participacaoTrecho.findUniqueOrThrow({ where: { id }, select: participacaoSelect });
    exigir(!p.trecho.iniciadoEm && agora < p.trecho.saidaPrevistaEm && ["ABERTO", "FECHADO"].includes(p.trecho.status), "Trecho não permite cancelamento");
    const limite = p.confirmacaoTardia && p.limiteEstornoEm ? p.limiteEstornoEm : p.trecho.limiteCancelamentoEm;
    exigir(p.status === "EM_ESPERA" || ((p.confirmacaoTardia || !p.trecho.inscricoesSuspensas) && agora <= limite), "Prazo de cancelamento encerrado");
    await cancelarTx(tx, id, usuarioId, "Cancelamento solicitado pelo estudante");
    await promoverTx(tx, p.trechoId, agora);
    return tx.participacaoTrecho.findUniqueOrThrow({ where: { id }, select: participacaoSelect });
  });
}

export function minhasParticipacoes(usuarioId: string, pagina: number, limite: number) {
  return prisma.participacaoTrecho.findMany({ where: { estudante: { usuarioId } }, select: participacaoSelect,
    skip: (pagina - 1) * limite, take: limite, orderBy: [{ criadoEm: "desc" }, { id: "desc" }] });
}
