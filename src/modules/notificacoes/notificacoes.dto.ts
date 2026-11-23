import type { Prisma } from "../../../generated/prisma";

export const notificacaoSelect = {
  id: true, tipo: true, tema: true, titulo: true, mensagem: true, criadoEm: true, lidaEm: true,
} satisfies Prisma.NotificacaoSelect;
export const preferenciasSelect = {
  ativadas: true, confirmacoes: true, alteracoesRota: true, cancelamentos: true, lembretes: true,
  avisosOperador: true, novidades: true, carteira: true, disciplina: true, operacao: true,
} satisfies Prisma.PreferenciasNotificacaoSelect;
