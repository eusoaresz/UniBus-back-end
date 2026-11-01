import { Prisma } from "../../../generated/prisma";

export const viagemSelect = {
  id: true, data: true, turno: true, rotaId: true, nomeRota: true, status: true,
  criadaPorId: true, criadoEm: true, atualizadoEm: true,
  trechos: {
    orderBy: { sentido: "asc" },
    select: {
      id: true, sentido: true, status: true, saidaPrevistaEm: true, chegadaPrevistaEm: true,
      limiteConfirmacaoEm: true, limiteCancelamentoEm: true, tarifa: true,
      motoristaId: true, veiculoId: true, motoristaExtraId: true, veiculoExtraId: true,
      capacidade: true, capacidadeExtra: true, inscricoesSuspensas: true,
      paradas: {
        where: { ativa: true },
        orderBy: { ordem: "asc" },
        select: { id: true, pontoParadaId: true, ordem: true, nome: true, cidade: true, endereco: true, referencia: true },
      },
    },
  },
} satisfies Prisma.ViagemSelect;

type Viagem = Prisma.ViagemGetPayload<{ select: typeof viagemSelect }>;

export function viagemDto(viagem: Viagem) {
  return {
    ...viagem,
    data: viagem.data.toISOString().slice(0, 10),
    trechos: viagem.trechos.map((trecho) => ({ ...trecho, tarifa: trecho.tarifa.toFixed(2) })),
  };
}
