import type { z } from "zod";
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

export function criarAviso(dados: z.infer<typeof criarAvisoSchema>, operadorId: string) {
  return prisma.aviso.create({
    data: {
      ...dados,
      expiraEm: dados.expiraEm ? new Date(dados.expiraEm) : null,
      publicadoPorId: operadorId,
    },
    select: avisoSelect,
  });
}

export async function listarAvisos(
  { pagina, limite, categoria, importante }: FiltrosAvisos,
  perfil?: string,
) {
  const agora = new Date();
  const registros = await prisma.aviso.findMany({
    where: {
      ativo: true,
      categoria,
      importante,
      AND: [
        { OR: [{ expiraEm: null }, { expiraEm: { gte: agora } }] },
        ...(perfil
          ? [{
              OR: [
                { publicoPerfil: perfil as "ESTUDANTE" | "MOTORISTA" | "OPERADOR" },
                { publicoPerfil: null },
              ],
            }]
          : []),
      ],
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

export async function consultarAviso(id: string) {
  const aviso = await prisma.aviso.findUnique({ where: { id }, select: avisoSelect });
  if (!aviso) throw new HttpError(404, "Aviso não encontrado");
  return aviso;
}

export async function editarAviso(id: string, dados: z.infer<typeof editarAvisoSchema>) {
  await consultarAviso(id);
  return prisma.aviso.update({
    where: { id },
    data: {
      ...dados,
      expiraEm: dados.expiraEm === undefined
        ? undefined
        : dados.expiraEm
          ? new Date(dados.expiraEm)
          : null,
    },
    select: avisoSelect,
  });
}

export async function alterarStatus(
  id: string,
  dados: z.infer<typeof alterarStatusAvisoSchema>,
) {
  await consultarAviso(id);
  return prisma.aviso.update({ where: { id }, data: dados, select: avisoSelect });
}