import type { z } from "zod";
import type { Prisma } from "../../../generated/prisma";
import { prisma } from "../../../lib/prisma";
import { HttpError } from "../../shared/errors/http-error";
import { executarTransacao } from "../carteira/carteira.financeiro";
import * as schemas from "./veiculos.schemas";

const select = { id: true, identificacao: true, placa: true, tipo: true, capacidade: true,
  ativo: true, criadoEm: true, atualizadoEm: true } as const;
type Veiculo = Prisma.VeiculoGetPayload<{ select: typeof select }>;
const estado = (v: Veiculo) => ({ identificacao: v.identificacao, placa: v.placa,
  tipo: v.tipo, capacidade: v.capacidade, ativo: v.ativo });

function transacao<T>(operadorId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return executarTransacao(prisma, async tx => {
    const op = await tx.usuario.findUnique({ where: { id: operadorId }, select: { perfil: true, status: true, bloqueioDisciplinarAte: true } });
    if (!op || op.perfil !== "OPERADOR" || op.status !== "ATIVA" || (op.bloqueioDisciplinarAte && op.bloqueioDisciplinarAte > new Date())) {
      throw new HttpError(403, "Somente operador ativo pode alterar veículos");
    }
    return fn(tx);
  });
}
async function obter(tx: Pick<Prisma.TransactionClient, "veiculo">, id: string) {
  const v = await tx.veiculo.findUnique({ where: { id }, select });
  if (!v) throw new HttpError(404, "Veículo não encontrado");
  return v;
}
export function criar(dados: z.infer<typeof schemas.criarVeiculoSchema>, operadorId: string) {
  return transacao(operadorId, async tx => {
    const v = await tx.veiculo.create({ data: dados, select });
    await tx.alteracaoVeiculo.create({ data: { veiculoId: v.id, realizadaPorId: operadorId,
      motivo: "Cadastro de veículo", dadosAnteriores: {}, dadosNovos: estado(v) } });
    return v;
  });
}
export async function listar({ pagina, limite, identificacao, placa, tipo, ativo }: z.infer<typeof schemas.listarVeiculosSchema>) {
  const registros = await prisma.veiculo.findMany({ where: { placa, tipo, ativo,
    identificacao: identificacao ? { contains: identificacao, mode: "insensitive" } : undefined },
  skip: (pagina - 1) * limite, take: limite + 1, orderBy: [{ criadoEm: "desc" }, { id: "desc" }], select });
  return { dados: registros.slice(0, limite), meta: { pagina, limite, temProxima: registros.length > limite } };
}
export function consultar(id: string) { return obter(prisma, id); }
export function editar(id: string, dados: z.infer<typeof schemas.editarVeiculoSchema>, operadorId: string) {
  return transacao(operadorId, async tx => {
    const anterior = await obter(tx, id);
    const { motivo, ...campos } = dados;
    const v = await tx.veiculo.update({ where: { id }, data: campos, select });
    await tx.alteracaoVeiculo.create({ data: { veiculoId: id, realizadaPorId: operadorId, motivo,
      dadosAnteriores: estado(anterior), dadosNovos: estado(v) } });
    return v;
  });
}
export function alterarStatus(id: string, dados: z.infer<typeof schemas.statusVeiculoSchema>, operadorId: string) {
  return transacao(operadorId, async tx => {
    const anterior = await obter(tx, id);
    if (!dados.ativo) {
      const vinculo = await tx.trechoViagem.findFirst({ where: {
        status: { in: ["ABERTO", "FECHADO", "EM_ANDAMENTO"] }, OR: [{ veiculoId: id }, { veiculoExtraId: id }],
      }, select: { id: true } });
      if (vinculo) throw new HttpError(409, "Substitua o veículo ou encerre/cancele os trechos antes de desativá-lo");
    }
    const v = await tx.veiculo.update({ where: { id }, data: { ativo: dados.ativo }, select });
    await tx.alteracaoVeiculo.create({ data: { veiculoId: id, realizadaPorId: operadorId, motivo: dados.motivo,
      dadosAnteriores: estado(anterior), dadosNovos: estado(v) } });
    return v;
  });
}
export async function historico(id: string, { pagina, limite }: z.infer<typeof schemas.paginacaoVeiculosSchema>) {
  await obter(prisma, id);
  const registros = await prisma.alteracaoVeiculo.findMany({ where: { veiculoId: id },
    skip: (pagina - 1) * limite, take: limite + 1, orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
    select: { id: true, motivo: true, dadosAnteriores: true, dadosNovos: true, criadoEm: true,
      realizadaPor: { select: { id: true, nome: true } } } });
  return { dados: registros.slice(0, limite), meta: { pagina, limite, temProxima: registros.length > limite } };
}
