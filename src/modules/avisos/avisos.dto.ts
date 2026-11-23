import { Prisma } from "../../../generated/prisma";

export const avisoSelect = {
  id: true,
  titulo: true,
  mensagem: true,
  categoria: true,
  importante: true,
  ativo: true,
  publicoPerfil: true,
  publicadoEm: true,
  expiraEm: true,
  criadoEm: true,
  atualizadoEm: true,
  publicadoPorId: true,
  publicadoPor: { select: { id: true, nome: true } },
} satisfies Prisma.AvisoSelect;