import { Prisma } from "../../../generated/prisma";
import { prisma } from "../../../lib/prisma";
import { executarTransacao, estornar } from "../carteira/carteira.financeiro";
import { HttpError } from "../../shared/errors/http-error";
import { registrarNotificacao, temaOperacional } from "../notificacoes/notificacoes.service";

export type Tx = Prisma.TransactionClient;
export type Ator = { id: string; perfil: string };
export const transacao = <T>(fn: (tx: Tx) => Promise<T>) => executarTransacao(prisma, fn);
export const pessoaSelect = { id: true, nome: true } as const;
export const participacaoSelect = {
  id: true, estudanteId: true, trechoId: true, origemId: true, destinoId: true,
  status: true, alocacao: true, ordemFila: true, cicloConfirmacao: true,
  confirmadaEm: true, canceladaEm: true, limiteEstornoEm: true,
} as const;
export function exigir(condicao: unknown, mensagem: string, status = 409): asserts condicao {
  if (!condicao) throw new HttpError(status, mensagem);
}
export async function notificar(tx: Tx, usuarioId: string, chave: string, titulo: string, mensagem: string) {
  return registrarNotificacao(tx, { usuarioId, chaveDeduplicacao: chave, tipo: "OPERACAO", tema: temaOperacional(chave), titulo, mensagem });
}
export async function notificarOperadores(tx: Tx, chave: string, titulo: string, mensagem: string) {
  for (const op of await tx.usuario.findMany({ where: { perfil: "OPERADOR", status: "ATIVA" }, select: { id: true } })) {
    await notificar(tx, op.id, `${chave}:${op.id}`, titulo, mensagem);
  }
}
export async function trechoTx(tx: Tx, id: string) {
  const trecho = await tx.trechoViagem.findUnique({ where: { id }, include: { viagem: true } });
  exigir(trecho, "Trecho não encontrado", 404);
  return trecho;
}
export async function atualizarViagem(tx: Tx, viagemId: string) {
  const trechos = await tx.trechoViagem.findMany({ where: { viagemId } });
  const status = trechos.every((t) => t.status === "CANCELADO") ? "CANCELADA"
    : trechos.every((t) => ["CONCLUIDO", "CANCELADO"].includes(t.status)) ? "CONCLUIDA"
    : trechos.some((t) => ["EM_ANDAMENTO", "CONCLUIDO"].includes(t.status)) ? "EM_ANDAMENTO"
      : trechos.some((t) => t.status === "RASCUNHO") ? "RASCUNHO" : "PROGRAMADA";
  await tx.viagem.update({ where: { id: viagemId }, data: { status } });
}
export async function cancelarTx(tx: Tx, id: string, atorId: string, motivo: string) {
  const p = await tx.participacaoTrecho.findUnique({ where: { id }, include: { estudante: { select: { usuarioId: true } } } });
  exigir(p, "Participação não encontrada", 404);
  if (["CANCELADA", "EXPIRADA"].includes(p.status)) return p;
  const cobranca = await tx.movimentacaoCarteira.findUnique({ where: { participacaoId_cicloConfirmacao_tipo: {
    participacaoId: p.id, cicloConfirmacao: p.cicloConfirmacao, tipo: "COBRANCA_CONFIRMACAO",
  } } });
  if (cobranca) await estornar(tx, { movimentacaoId: cobranca.id, realizadaPorId: atorId,
    chaveIdempotencia: `cancelamento:${p.id}:${p.cicloConfirmacao}`, motivo });
  const atualizado = await tx.participacaoTrecho.update({ where: { id }, data: { status: "CANCELADA", canceladaEm: new Date(), alocacao: null } });
  await tx.alteracaoParticipacao.create({ data: { participacaoId: id, acao: "CANCELAMENTO", motivo,
    realizadaPorId: atorId, dadosAnteriores: { status: p.status }, dadosNovos: { status: "CANCELADA" } } });
  await notificar(tx, p.estudante.usuarioId, `cancelamento:${id}:${p.cicloConfirmacao}`, "Participação cancelada", motivo);
  return atualizado;
}
export async function semestreTx(tx: Tx, instante: Date) {
  const semestre = await tx.semestreLetivo.findFirst({ where: { inicio: { lte: instante }, fim: { gt: instante } } });
  exigir(semestre, "Cadastre o semestre letivo para esta data");
  return semestre;
}
