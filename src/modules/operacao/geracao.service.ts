import type { DiaSemana } from "../../../generated/prisma";
import { prisma } from "../../../lib/prisma";
import { consultarRota, dadosTrechos } from "../viagens/viagens.service";
import { alocarTx, publicarTx } from "./recursos.service";
import { transacao } from "./operacao.shared";

export const DIAS_GERADOS = 30;
const DURACAO_IDA_MIN = 60;
const diasSemana: (DiaSemana | null)[] = [null, "SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", null];

const diaLocal = (instante: Date) => instante.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const somarDias = (dia: string, dias: number) => {
  const data = new Date(`${dia}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
};
// Pedro Osório segue UTC-3 o ano todo (sem horário de verão desde 2019).
const horario = (dia: string, minutos: number) => new Date(Date.parse(`${dia}T00:00:00-03:00`) + minutos * 60000);

// Cria e publica as viagens dos próximos dias a partir das escalas semanais ativas.
// Não recria data/turno/rota que já exista, inclusive viagens canceladas pelo operador (feriados).
export async function gerarViagensDasEscalas(agora = new Date()) {
  const resultado = { criadas: 0, falhas: [] as string[] };
  const operador = await prisma.usuario.findFirst({ where: { perfil: "OPERADOR", status: "ATIVA" },
    orderBy: { criadoEm: "asc" }, select: { id: true } });
  if (!operador) return resultado;
  const escalas = await prisma.escalaSemanal.findMany({ where: { ativa: true,
    saidaIdaMinuto: { not: null }, saidaVoltaMinuto: { not: null }, chegadaPedroMinuto: { not: null } },
  include: { rota: { select: { nome: true } } } });
  if (!escalas.length) return resultado;

  const hoje = diaLocal(agora);
  const existentes = new Set((await prisma.viagem.findMany({
    where: { data: { gte: new Date(hoje), lte: new Date(somarDias(hoje, DIAS_GERADOS - 1)) } },
    select: { data: true, turno: true, rotaId: true },
  })).map((v) => `${v.data.toISOString().slice(0, 10)}|${v.turno}|${v.rotaId}`));

  for (let i = 0; i < DIAS_GERADOS; i++) {
    const dia = somarDias(hoje, i);
    const diaSemana = diasSemana[new Date(`${dia}T12:00:00Z`).getUTCDay()];
    for (const escala of escalas.filter((e) => e.diaSemana === diaSemana)) {
      const saidaIda = horario(dia, escala.saidaIdaMinuto!);
      if (existentes.has(`${dia}|${escala.turno}|${escala.rotaId}`) || saidaIda <= agora) continue;
      // Sem semestre letivo (férias), não há viagens a gerar.
      if (!await prisma.semestreLetivo.findFirst({ where: { inicio: { lte: saidaIda }, fim: { gt: saidaIda } } })) continue;

      const chegadaIda = new Date(saidaIda.getTime() + DURACAO_IDA_MIN * 60000);
      const saidaVolta = horario(dia, escala.saidaVoltaMinuto! + escala.saidaVoltaDiaOffset * 1440);
      const chegadaVolta = horario(dia, escala.chegadaPedroMinuto! + escala.chegadaPedroDiaOffset * 1440);
      const descricao = `${dia} ${escala.turno} ${escala.rota.nome}`;
      if (saidaVolta < chegadaIda) {
        resultado.falhas.push(`${descricao}: a volta sai antes da chegada da ida (ida dura ${DURACAO_IDA_MIN} min)`);
        continue;
      }

      try {
        await transacao(async (tx) => {
          const rota = await consultarRota(tx, escala.rotaId);
          const trechos = dadosTrechos({ data: dia, turno: escala.turno, rotaId: escala.rotaId, trechos: [
            { sentido: "IDA", saidaPrevistaEm: saidaIda.toISOString(), chegadaPrevistaEm: chegadaIda.toISOString() },
            { sentido: "VOLTA", saidaPrevistaEm: saidaVolta.toISOString(), chegadaPrevistaEm: chegadaVolta.toISOString() },
          ] }, rota.pontos);
          const viagem = await tx.viagem.create({ data: { data: new Date(dia), turno: escala.turno, rotaId: escala.rotaId,
            nomeRota: rota.nome, criadaPorId: operador.id, escalaSemanalId: escala.id, trechos: { create: trechos } },
          select: { id: true, trechos: { select: { id: true } } } });
          for (const trecho of viagem.trechos) {
            await alocarTx(tx, trecho.id, { motoristaId: escala.motoristaId, veiculoId: escala.veiculoId,
              motoristaExtraId: null, veiculoExtraId: null, motivo: "Alocação automática pela escala semanal" }, operador.id);
          }
          await publicarTx(tx, viagem.id, operador.id);
        });
        resultado.criadas++;
      } catch (erro) {
        // Uma escala com problema (CNH vencida, conflito de horário...) não impede as demais.
        resultado.falhas.push(`${descricao}: ${erro instanceof Error ? erro.message : String(erro)}`);
      }
    }
  }
  return resultado;
}
