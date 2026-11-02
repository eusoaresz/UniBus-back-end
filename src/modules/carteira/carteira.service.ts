import type { z } from "zod";
import { Prisma } from "../../../generated/prisma";
import { prisma } from "../../../lib/prisma";
import { HttpError } from "../../shared/errors/http-error";
import { executarTransacao, lancar, estornar } from "./carteira.financeiro";
import * as schemas from "./carteira.schemas";
import { registrarNotificacao } from "../notificacoes/notificacoes.service";

const pessoa = { select: { id: true, nome: true } } as const;
const recargaInclude = {
  solicitadaPor: pessoa, analisadaPor: pessoa,
  credito: { select: { id: true, estorno: { select: { id: true, criadoEm: true, motivo: true } } } },
  carteira: { select: { estudante: { select: { id: true, matricula: true, unidadeEnsinoId: true, usuario: pessoa } } } },
} satisfies Prisma.RecargaInclude;

export function serializar(valor: unknown): any {
  if (valor instanceof Prisma.Decimal) return valor.toFixed(2);
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === "bigint") return valor.toString();
  if (Array.isArray(valor)) return valor.map(serializar);
  if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, serializar(v)]));
  return valor;
}

export async function carteiraPropria(usuarioId: string) {
  const estudante = await prisma.estudante.findUnique({ where: { usuarioId }, include: { carteira: true } });
  if (!estudante?.carteira) throw new HttpError(404, "Cadastro de estudante ou carteira não encontrado");
  if (!["APROVADO", "SUSPENSO", "ENCERRADO"].includes(estudante.statusCadastro)) throw new HttpError(403, "Cadastro sem acesso à carteira");
  return estudante.carteira;
}

export async function carteiraEstudante(estudanteId: string, tx: Prisma.TransactionClient = prisma) {
  const carteira = await tx.carteira.findUnique({ where: { estudanteId } });
  if (!carteira) throw new HttpError(404, "Carteira não encontrada");
  return carteira;
}

function paginar<T>(registros: T[], pagina: number, limite: number) {
  return { dados: registros.slice(0, limite), meta: { pagina, limite, temProxima: registros.length > limite } };
}

export async function extrato(carteiraId: string, { pagina, limite }: z.infer<typeof schemas.paginaSchema>) {
  const registros = await prisma.movimentacaoCarteira.findMany({
    where: { carteiraId }, orderBy: [{ criadoEm: "desc" }, { id: "desc" }], skip: (pagina - 1) * limite, take: limite + 1,
    select: {
      id: true, tipo: true, valor: true, saldoApos: true, criadoEm: true, motivo: true, recargaId: true,
      participacao: { select: { trechoId: true, trecho: { select: { viagemId: true, sentido: true } } } },
      movimentacaoOriginal: { select: { id: true, recargaId: true } },
    },
  });
  return paginar(registros, pagina, limite);
}

export async function listarCarteiras({ pagina, limite, nome, cpf }: z.infer<typeof schemas.carteirasFiltroSchema>) {
  const registros = await prisma.carteira.findMany({
    where: { estudante: { usuario: { nome: nome ? { contains: nome, mode: "insensitive" } : undefined, cpf } } },
    skip: (pagina - 1) * limite, take: limite + 1, orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
    include: { estudante: { select: { id: true, matricula: true, unidadeEnsinoId: true, usuario: pessoa } } },
  });
  return paginar(registros, pagina, limite);
}

export async function listarRecargas(filtro: z.infer<typeof schemas.recargasFiltroSchema>, carteiraId?: string) {
  const { pagina, limite, ordem, status } = filtro;
  const registros = await prisma.recarga.findMany({ where: { carteiraId, status },
    skip: (pagina - 1) * limite, take: limite + 1, orderBy: [{ criadoEm: ordem }, { id: ordem }], include: recargaInclude });
  const pendentes = await prisma.recarga.groupBy({ by: ["carteiraId"],
    where: { carteiraId: { in: [...new Set(registros.map((r) => r.carteiraId))] }, status: "PENDENTE" }, _count: { _all: true } });
  return paginar(registros.map((r) => ({ ...r, pendentesDoEstudante: pendentes.find((p) => p.carteiraId === r.carteiraId)?._count._all ?? 0 })), pagina, limite);
}

export function solicitarRecarga(carteiraId: string, usuarioId: string, dados: z.infer<typeof schemas.recargaSchema>) {
  return executarTransacao(prisma, async (tx) => {
    const estudante = await tx.estudante.findUnique({ where: { usuarioId }, select: { statusCadastro: true, carteira: { select: { id: true } } } });
    if (!estudante || !["APROVADO", "SUSPENSO"].includes(estudante.statusCadastro) || estudante.carteira?.id !== carteiraId) throw new HttpError(403, "Cadastro sem permissão para solicitar recarga");
    const chave = `recarga:${usuarioId}:${dados.chaveIdempotencia}`;
    const existente = await tx.recarga.findUnique({ where: { chaveIdempotencia: chave }, include: recargaInclude });
    if (existente) {
      if (existente.carteiraId !== carteiraId || !existente.valor.eq(dados.valor) || existente.formaPagamento !== "PIX") throw new HttpError(409, "Chave utilizada com outros dados");
      return existente;
    }
    return tx.recarga.create({ data: { carteiraId, valor: dados.valor, formaPagamento: "PIX", solicitadaPorId: usuarioId, chaveIdempotencia: chave }, include: recargaInclude });
  });
}

async function avisar(tx: Prisma.TransactionClient, carteiraId: string, chave: string, mensagem: string) {
  const carteira = await tx.carteira.findUniqueOrThrow({ where: { id: carteiraId }, select: { estudante: { select: { usuarioId: true } } } });
  await registrarNotificacao(tx, { usuarioId: carteira.estudante.usuarioId, tipo: "RECARGA", tema: "CARTEIRA", titulo: "Atualização da recarga", mensagem, chaveDeduplicacao: chave });
}

export function analisarRecarga(id: string, operadorId: string, aprovada: boolean, dados: z.infer<typeof schemas.rejeitarSchema>) {
  return executarTransacao(prisma, async (tx) => {
    const recarga = await tx.recarga.findUnique({ where: { id }, include: { credito: true } });
    if (!recarga) throw new HttpError(404, "Recarga não encontrada");
    const status = aprovada ? "APROVADA" : "REJEITADA";
    const chave = `analise:${operadorId}:${dados.chaveIdempotencia}`;
    const usada = await tx.movimentacaoCarteira.findUnique({ where: { chaveIdempotencia: chave } });
    if (usada && usada.recargaId !== id) throw new HttpError(409, "Chave utilizada em outra recarga");
    if (recarga.status === status) {
      if (!aprovada && (recarga.observacaoAnalise ?? null) !== (dados.motivo ?? null)) throw new HttpError(409, "Recarga já rejeitada com outra análise");
      if (aprovada && !recarga.credito) throw new HttpError(409, "Recarga antiga sem crédito registrado exige revisão");
      return tx.recarga.findUniqueOrThrow({ where: { id }, include: recargaInclude });
    }
    if (recarga.status !== "PENDENTE") throw new HttpError(409, "A recarga já foi analisada");
    if (aprovada) await lancar(tx, { carteiraId: recarga.carteiraId, valor: recarga.valor, tipo: "RECARGA", recargaId: id, realizadaPorId: operadorId, chaveIdempotencia: chave });
    const resultado = await tx.recarga.update({ where: { id }, data: { status, analisadaEm: new Date(), analisadaPorId: operadorId, observacaoAnalise: dados.motivo }, include: recargaInclude });
    await avisar(tx, recarga.carteiraId, `analise-recarga:${id}`, `Sua recarga de R$ ${recarga.valor.toFixed(2)} foi ${aprovada ? "aprovada" : "rejeitada"}.`);
    return resultado;
  });
}

export function registrarDinheiro(operadorId: string, dados: z.infer<typeof schemas.dinheiroSchema>) {
  return executarTransacao(prisma, async (tx) => {
    const carteira = await carteiraEstudante(dados.estudanteId, tx);
    const chave = `recarga:${operadorId}:${dados.chaveIdempotencia}`;
    const anterior = await tx.recarga.findUnique({ where: { chaveIdempotencia: chave }, include: recargaInclude });
    if (anterior) {
      if (anterior.carteiraId !== carteira.id || !anterior.valor.eq(dados.valor) || anterior.formaPagamento !== "DINHEIRO") throw new HttpError(409, "Chave utilizada com outros dados");
      return anterior;
    }
    const recarga = await tx.recarga.create({ data: { carteiraId: carteira.id, valor: dados.valor, formaPagamento: "DINHEIRO", status: "APROVADA", solicitadaPorId: operadorId, analisadaPorId: operadorId, analisadaEm: new Date(), chaveIdempotencia: chave } });
    await lancar(tx, { carteiraId: carteira.id, valor: recarga.valor, tipo: "RECARGA", recargaId: recarga.id, realizadaPorId: operadorId, chaveIdempotencia: `credito:${recarga.id}` });
    await avisar(tx, carteira.id, `analise-recarga:${recarga.id}`, `Recarga em dinheiro de R$ ${recarga.valor.toFixed(2)} registrada.`);
    return tx.recarga.findUniqueOrThrow({ where: { id: recarga.id }, include: recargaInclude });
  });
}

export function estornarRecarga(id: string, operadorId: string, dados: z.infer<typeof schemas.estornarSchema>) {
  return executarTransacao(prisma, async (tx) => {
    const recarga = await tx.recarga.findUnique({ where: { id }, include: { credito: { include: { estorno: true } } } });
    if (!recarga) throw new HttpError(404, "Recarga não encontrada");
    if (recarga.status !== "APROVADA" || !recarga.credito) throw new HttpError(409, "Somente recarga aprovada com crédito pode ser estornada");
    const resultado = await estornar(tx, { movimentacaoId: recarga.credito.id, realizadaPorId: operadorId, motivo: dados.motivo, chaveIdempotencia: `estorno:${operadorId}:${dados.chaveIdempotencia}` });
    if (!recarga.credito.estorno) await avisar(tx, recarga.carteiraId, `estorno-recarga:${id}`, `A recarga de R$ ${recarga.valor.toFixed(2)} foi estornada.`);
    return resultado;
  });
}

export async function notificacoes(usuarioId: string, { pagina, limite }: z.infer<typeof schemas.paginaSchema>) {
  const registros = await prisma.notificacao.findMany({ where: { usuarioId }, orderBy: [{ criadoEm: "desc" }, { id: "desc" }], skip: (pagina - 1) * limite, take: limite + 1,
    select: { id: true, tipo: true, titulo: true, mensagem: true, criadoEm: true, lidaEm: true } });
  return paginar(registros, pagina, limite);
}
