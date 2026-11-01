import { Prisma } from "../../../generated/prisma";

export const preferenciasSelect = {
  id: true,
  turnos: true,
  rotas: { orderBy: { rota: { nome: "asc" } }, select: { rota: { select: { id: true, nome: true, descricao: true, ativa: true } } } },
  cidades: { orderBy: { cidade: { nome: "asc" } }, select: { cidade: { select: { id: true, nome: true, ativa: true } } } },
} satisfies Prisma.PreferenciasSelect;

type Preferencias = Prisma.PreferenciasGetPayload<{ select: typeof preferenciasSelect }>;

export const preferenciasOpcoesDto = (rotas: Array<{ id: string; nome: string }>, cidades: Array<{ id: string; nome: string }>) => ({
  rotas,
  cidades,
  turnos: ["MANHA", "TARDE", "NOITE"] as const,
});

export function preferenciasDto(preferencias: Preferencias | null) {
  if (!preferencias) {
    return { id: null, rotaIds: [], rotas: [], turnos: [], cidadeIds: [], cidades: [] };
  }
  return {
    id: preferencias.id,
    rotaIds: preferencias.rotas.map(({ rota }) => rota.id),
    rotas: preferencias.rotas.map(({ rota }) => rota),
    turnos: preferencias.turnos,
    cidadeIds: preferencias.cidades.map(({ cidade }) => cidade.id),
    cidades: preferencias.cidades.map(({ cidade }) => cidade),
  };
}