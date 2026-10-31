import { Prisma, type PrismaClient } from "../../../generated/prisma";
import { HttpError } from "../../shared/errors/http-error";

export class ConflitoCarteira extends Error {}
export async function executarTransacao<T>(cliente: Pick<PrismaClient, "$transaction">, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try { return await cliente.$transaction(fn, { isolationLevel: "Serializable" }); }
    catch (erro) {
      const code = erro && typeof erro === "object" && "code" in erro ? erro.code : undefined;
      if (erro instanceof ConflitoCarteira || code === "P2034" || code === "P2002") {
        if (tentativa < 2) continue;
        throw new HttpError(409, "Operação concorrente ou dados já utilizados. Consulte o resultado e tente novamente");
      }
      throw erro;
    }
  }
  throw new HttpError(409, "Não foi possível concluir a operação");
}

type Lancamento = {
  carteiraId: string; valor: Prisma.Decimal; tipo: "RECARGA" | "COBRANCA_CONFIRMACAO" | "ESTORNO";
  chaveIdempotencia: string; realizadaPorId: string; recargaId?: string;
  participacaoId?: string; cicloConfirmacao?: number; movimentacaoOriginalId?: string; motivo?: string;
};

export async function lancar(tx: Prisma.TransactionClient, dados: Lancamento) {
  if (!dados.valor.isFinite() || dados.valor.isZero() || dados.valor.decimalPlaces() > 2) throw new HttpError(400, "Valor monetário inválido");
  const anterior = await tx.movimentacaoCarteira.findUnique({ where: { chaveIdempotencia: dados.chaveIdempotencia } });
  if (anterior) {
    const campos = ["carteiraId", "tipo", "realizadaPorId", "recargaId", "participacaoId", "cicloConfirmacao", "movimentacaoOriginalId", "motivo"] as const;
    if (!anterior.valor.eq(dados.valor) || campos.some((c) => (anterior[c] ?? null) !== (dados[c] ?? null))) {
      throw new HttpError(409, "Chave de idempotência já utilizada com outros dados");
    }
    return anterior;
  }
  const carteira = await tx.carteira.findUnique({ where: { id: dados.carteiraId } });
  if (!carteira) throw new HttpError(404, "Carteira não encontrada");
  const saldo = carteira.saldo.plus(dados.valor);
  if (saldo.lt(-20)) throw new HttpError(409, `Saldo insuficiente. Saldo atual: R$ ${carteira.saldo.toFixed(2)}; disponível para uso: R$ ${Prisma.Decimal.max(0, carteira.saldo.plus(20)).toFixed(2)}`);
  if (saldo.gt("99999999.99") || dados.valor.abs().gt("99999999.99")) throw new HttpError(400, "Valor excede a capacidade monetária do sistema");
  const alteracao = await tx.carteira.updateMany({ where: { id: carteira.id, versao: carteira.versao }, data: { saldo, versao: { increment: 1 } } });
  if (alteracao.count !== 1) throw new ConflitoCarteira();
  return tx.movimentacaoCarteira.create({ data: { ...dados, saldoApos: saldo } });
}

export async function debitar(tx: Prisma.TransactionClient, dados: {
  participacaoId: string; cicloConfirmacao: number; valor: string; chaveIdempotencia: string; realizadaPorId: string;
}) {
  if (!Number.isInteger(dados.cicloConfirmacao) || dados.cicloConfirmacao < 1 || !/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(dados.valor)) throw new HttpError(400, "Cobrança inválida");
  const valor = new Prisma.Decimal(dados.valor);
  if (valor.lte(0)) throw new HttpError(400, "Cobrança inválida");
  const chaveUsada = await tx.movimentacaoCarteira.findUnique({ where: { chaveIdempotencia: dados.chaveIdempotencia } });
  if (chaveUsada && (chaveUsada.participacaoId !== dados.participacaoId || chaveUsada.cicloConfirmacao !== dados.cicloConfirmacao || chaveUsada.tipo !== "COBRANCA_CONFIRMACAO" || !chaveUsada.valor.eq(valor.negated()))) throw new HttpError(409, "Chave utilizada em outra cobrança");
  const participacao = await tx.participacaoTrecho.findUnique({ where: { id: dados.participacaoId }, include: { estudante: { include: { carteira: true } }, trecho: true } });
  if (!participacao?.estudante.carteira) throw new HttpError(404, "Participação ou carteira não encontrada");
  if (!valor.eq(participacao.trecho.tarifa)) throw new HttpError(409, "Cobrança diferente da tarifa do trecho");
  const antiga = await tx.movimentacaoCarteira.findUnique({ where: { participacaoId_cicloConfirmacao_tipo: { participacaoId: dados.participacaoId, cicloConfirmacao: dados.cicloConfirmacao, tipo: "COBRANCA_CONFIRMACAO" } } });
  if (antiga) {
    if (!antiga.valor.eq(valor.negated())) throw new HttpError(409, "O ciclo já possui cobrança com outro valor");
    return antiga;
  }
  if (participacao.status !== "CONFIRMADA" || participacao.cicloConfirmacao !== dados.cicloConfirmacao) throw new HttpError(409, "A cobrança exige participação confirmada no ciclo informado");
  return lancar(tx, { ...dados, carteiraId: participacao.estudante.carteira.id, valor: valor.negated(), tipo: "COBRANCA_CONFIRMACAO" });
}

export async function estornar(tx: Prisma.TransactionClient, dados: { movimentacaoId: string; chaveIdempotencia: string; realizadaPorId: string; motivo: string }) {
  if (dados.motivo.trim().length < 3) throw new HttpError(400, "Informe o motivo do estorno");
  const original = await tx.movimentacaoCarteira.findUnique({ where: { id: dados.movimentacaoId }, include: { estorno: true } });
  if (!original) throw new HttpError(404, "Movimentação não encontrada");
  if (original.tipo === "ESTORNO") throw new HttpError(409, "Não é permitido estornar um estorno");
  const chave = await tx.movimentacaoCarteira.findUnique({ where: { chaveIdempotencia: dados.chaveIdempotencia } });
  if (chave && chave.movimentacaoOriginalId !== original.id) throw new HttpError(409, "Chave utilizada em outra operação");
  if (original.estorno) return original.estorno;
  return lancar(tx, {
    carteiraId: original.carteiraId, tipo: "ESTORNO", valor: original.valor.negated(),
    movimentacaoOriginalId: original.id, participacaoId: original.participacaoId ?? undefined,
    cicloConfirmacao: original.cicloConfirmacao ?? undefined, realizadaPorId: dados.realizadaPorId,
    chaveIdempotencia: dados.chaveIdempotencia, motivo: dados.motivo,
  });
}
