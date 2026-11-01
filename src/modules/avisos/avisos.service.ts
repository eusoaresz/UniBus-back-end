import { transacaoPerfil } from "../usuarios/usuarios-dados.service";
import type { z } from "zod";
import type { Prisma } from "../../../generated/prisma";
import { prisma } from "../../../lib/prisma";
import { HttpError } from "../../shared/errors/http-error";
import { avisoSelect } from "./avisos.dto";
import {
  alterarStatusAvisoSchema,
  criarAvisoSchema,
  editarAvisoSchema,
  listarAvisosSchema,
} from "./avisos.schemas";

type FiltrosAvisos = z.infer<typeof listarAvisosSchema>;

function visibilidade(perfil: string): Prisma.AvisoWhereInput {
  const agora = new Date();
  const publico = perfil === "ESTUDANTE" || perfil === "MOTORISTA" || perfil === "OPERADOR" ? perfil : undefined;
  if (!publico) throw new HttpError(403, "Perfil sem permissão para acesso");
  return {
    ativo: true,
    publicadoEm: { lte: agora },
    AND: [
      { OR: [{ expiraEm: null }, { expiraEm: { gt: agora } }] },
      { OR: [{ publicoPerfil: publico }, { publicoPerfil: null }] },
    ],
  };
}

const auditoriaJson = (valor: object): Prisma.InputJsonObject => JSON.parse(JSON.stringify(valor));
export function criarAviso(dados: z.infer<typeof criarAvisoSchema>, operadorId: string) {
  return transacaoPerfil(operadorId, async tx => {
    const aviso = await tx.aviso.create({ data: { ...dados, expiraEm: dados.expiraEm ? new Date(dados.expiraEm) : null, publicadoPorId: operadorId }, select: avisoSelect });
    await tx.alteracaoAviso.create({ data: { avisoId: aviso.id, realizadaPorId: operadorId, motivo: "Publicação de aviso", dadosAnteriores: {}, dadosNovos: auditoriaJson(aviso) } });
    return aviso;
  });
}
export async function listarAvisos(
  filtros: FiltrosAvisos,
  perfil: string,
) {
  return listar(filtros, visibilidade(perfil));
}

export function listarGestao(filtros: FiltrosAvisos) {
  return listar(filtros, {});
}

async function listar(
  { pagina, limite, categoria, importante }: FiltrosAvisos,
  visibilidade: Prisma.AvisoWhereInput,
) {
  const registros = await prisma.aviso.findMany({
    where: {
      ...visibilidade,
      categoria,
      importante,
    },
    skip: (pagina - 1) * limite,
    take: limite + 1,
    orderBy: [{ importante: "desc" }, { publicadoEm: "desc" }, { id: "desc" }],
    select: avisoSelect,
  });

  return {
    dados: registros.slice(0, limite),
    meta: { pagina, limite, temProxima: registros.length > limite },
  };
}

export async function consultarAviso(id: string, perfil: string) {
  const aviso = await prisma.aviso.findFirst({ where: { id, ...visibilidade(perfil) }, select: avisoSelect });
  if (!aviso) throw new HttpError(404, "Aviso não encontrado");
  return aviso;
}

export async function consultarGestao(id: string) {
  const aviso = await prisma.aviso.findUnique({ where: { id }, select: avisoSelect });
  if (!aviso) throw new HttpError(404, "Aviso não encontrado");
  return aviso;
}

export function editarAviso(id: string, dados: z.infer<typeof editarAvisoSchema>, operadorId: string) {
  return transacaoPerfil(operadorId, async tx => {
    const anterior = await tx.aviso.findUnique({ where: { id }, select: avisoSelect });
    if (!anterior) throw new HttpError(404, "Aviso não encontrado");
    const { motivo, ...campos } = dados;
    const novo = await tx.aviso.update({ where: { id }, data: { ...campos,
      expiraEm: campos.expiraEm === undefined ? undefined : campos.expiraEm ? new Date(campos.expiraEm) : null }, select: avisoSelect });
    await tx.alteracaoAviso.create({ data: { avisoId: id, realizadaPorId: operadorId, motivo, dadosAnteriores: auditoriaJson(anterior), dadosNovos: auditoriaJson(novo) } });
    return novo;
  });
}
export function alterarStatus(id: string, dados: z.infer<typeof alterarStatusAvisoSchema>, operadorId: string) {
  return transacaoPerfil(operadorId, async tx => {
    const anterior = await tx.aviso.findUnique({ where: { id }, select: avisoSelect });
    if (!anterior) throw new HttpError(404, "Aviso não encontrado");
    const novo = await tx.aviso.update({ where: { id }, data: { ativo: dados.ativo }, select: avisoSelect });
    await tx.alteracaoAviso.create({ data: { avisoId: id, realizadaPorId: operadorId, motivo: dados.motivo, dadosAnteriores: auditoriaJson(anterior), dadosNovos: auditoriaJson(novo) } });
    return novo;
  });
}