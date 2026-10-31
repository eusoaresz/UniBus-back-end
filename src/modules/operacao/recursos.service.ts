import type { z } from "zod";
import { Prisma } from "../../../generated/prisma";
import { alocacaoSchema } from "./operacao.schemas";
import { transacao, trechoTx, exigir, semestreTx, notificar, type Tx } from "./operacao.shared";

type Trecho = Awaited<ReturnType<typeof trechoTx>>;
export async function validarRecurso(tx: Tx, trecho: Trecho, motoristaId: string, veiculoId: string) {
  const motorista = await tx.motorista.findUnique({ where: { id: motoristaId }, include: { usuario: { select: { status: true, perfil: true } } } });
  const veiculo = await tx.veiculo.findUnique({ where: { id: veiculoId } });
  exigir(motorista && veiculo, "Motorista ou veículo não encontrado", 404);
  exigir(motorista.usuario.status === "ATIVA" && motorista.usuario.perfil === "MOTORISTA", "Motorista sem acesso ativo");
  exigir(motorista.validadeCnh.toISOString().slice(0, 10) >= trecho.chegadaPrevistaEm.toISOString().slice(0, 10), "CNH vencida na data da viagem");
  exigir(["D", "E"].includes(motorista.categoriaCnh), "Categoria da CNH incompatível com transporte de passageiros");
  exigir(veiculo.ativo && veiculo.capacidade > 0, "Veículo inativo ou sem capacidade");
  const candidatos = await tx.trechoViagem.findMany({ where: {
    id: { not: trecho.id }, status: { not: "CANCELADO" },
    OR: [{ motoristaId }, { motoristaExtraId: motoristaId }, { veiculoId }, { veiculoExtraId: veiculoId }],
  } });
  for (const outro of candidatos) {
    const intervalo = outro.viagemId === trecho.viagemId ? 0 : 120 * 60000;
    exigir(trecho.saidaPrevistaEm.getTime() >= outro.chegadaPrevistaEm.getTime() + intervalo ||
      outro.saidaPrevistaEm.getTime() >= trecho.chegadaPrevistaEm.getTime() + intervalo,
    "Conflito de motorista/veículo ou intervalo menor que 120 minutos entre viagens");
  }
  return { motorista, veiculo };
}

export async function alocarTx(tx: Tx, id: string, dados: z.infer<typeof alocacaoSchema>, atorId: string) {
  const trecho = await trechoTx(tx, id);
  exigir(["RASCUNHO", "ABERTO", "FECHADO"].includes(trecho.status), "Trecho não permite alteração de recursos");
  exigir(!dados.motoristaExtraId || dados.motoristaExtraId !== dados.motoristaId, "Motoristas normal e extra devem ser diferentes");
  exigir(!dados.veiculoExtraId || dados.veiculoExtraId !== dados.veiculoId, "Veículos normal e extra devem ser diferentes");
  const principal = await validarRecurso(tx, trecho, dados.motoristaId, dados.veiculoId);
  const extra = dados.motoristaExtraId && dados.veiculoExtraId
    ? await validarRecurso(tx, trecho, dados.motoristaExtraId, dados.veiculoExtraId) : null;
  const confirmados = await tx.participacaoTrecho.findMany({ where: { trechoId: id, status: "CONFIRMADA" }, orderBy: { ordemFila: "asc" } });
  exigir(confirmados.length <= principal.veiculo.capacidade + (extra?.veiculo.capacidade ?? 0), "Capacidade insuficiente para todos os confirmados");
  for (let i = 0; i < confirmados.length; i++) {
    const p = confirmados[i];
    const alocacao = i < principal.veiculo.capacidade ? "VEICULO" : "EXTRA";
    if (p.alocacao !== alocacao) {
      await tx.participacaoTrecho.update({ where: { id: p.id }, data: { alocacao } });
      await tx.alteracaoParticipacao.create({ data: { participacaoId: p.id, acao: "TROCA_VEICULO", motivo: dados.motivo,
        realizadaPorId: atorId, dadosAnteriores: { alocacao: p.alocacao }, dadosNovos: { alocacao } } });
    }
  }
  const atualizado = await tx.trechoViagem.update({ where: { id }, data: {
    motoristaId: dados.motoristaId, veiculoId: dados.veiculoId,
    capacidade: principal.veiculo.capacidade, motoristaExtraId: dados.motoristaExtraId,
    veiculoExtraId: dados.veiculoExtraId, capacidadeExtra: extra?.veiculo.capacidade ?? null,
  } });
  await tx.alteracaoTrecho.create({ data: { trechoId: id, motivo: dados.motivo, realizadaPorId: atorId,
    dadosAnteriores: JSON.parse(JSON.stringify(trecho)), dadosNovos: JSON.parse(JSON.stringify(atualizado)) } });
  for (const p of confirmados) {
    const e = await tx.estudante.findUniqueOrThrow({ where: { id: p.estudanteId }, select: { usuarioId: true } });
    await notificar(tx, e.usuarioId, `recursos:${id}:${atualizado.atualizadoEm.toISOString()}:${p.id}`, "Transporte atualizado", "Confira os recursos atribuídos à sua viagem no aplicativo.");
  }
  return atualizado;
}

export const alocar = (id: string, dados: z.infer<typeof alocacaoSchema>, atorId: string) => transacao((tx) => alocarTx(tx, id, dados, atorId));

export function publicar(id: string, atorId: string) {
  return transacao(async (tx) => {
    const viagem = await tx.viagem.findUnique({ where: { id }, include: { trechos: true, rota: { include: { paradas: { include: { pontoParada: true } } } } } });
    exigir(viagem, "Viagem não encontrada", 404);
    if (viagem.status === "PROGRAMADA") return viagem;
    exigir(viagem.status === "RASCUNHO" && viagem.trechos.length === 2 && new Set(viagem.trechos.map((t) => t.sentido)).size === 2, "Publicação exige ida e volta em rascunho");
    const ida = viagem.trechos.find((t) => t.sentido === "IDA")!;
    const volta = viagem.trechos.find((t) => t.sentido === "VOLTA")!;
    exigir(ida.chegadaPrevistaEm <= volta.saidaPrevistaEm, "Ida e volta não podem se sobrepor");
    exigir(viagem.rota.ativa && viagem.rota.paradas.length >= 3 && viagem.rota.paradas.every((p) => p.pontoParada.ativo), "Rota ou paradas indisponíveis");
    for (const t of viagem.trechos) {
      exigir(t.status === "RASCUNHO" && t.saidaPrevistaEm > new Date(), "Trecho inválido para publicação");
      await semestreTx(tx, t.saidaPrevistaEm);
      exigir(t.motoristaId && t.veiculoId && t.capacidade, "Aloque motorista e veículo antes de publicar");
      const principal = await validarRecurso(tx, { ...t, viagem }, t.motoristaId, t.veiculoId);
      exigir(t.capacidade <= principal.veiculo.capacidade, "Capacidade do veículo foi reduzida; revise a alocação");
      exigir(Boolean(t.motoristaExtraId) === Boolean(t.veiculoExtraId), "Alocação extra incompleta");
      if (t.motoristaExtraId && t.veiculoExtraId) await validarRecurso(tx, { ...t, viagem }, t.motoristaExtraId, t.veiculoExtraId);
      await tx.trechoViagem.update({ where: { id: t.id }, data: { status: "ABERTO" } });
      await tx.alteracaoTrecho.create({ data: { trechoId: t.id, motivo: "Publicação", realizadaPorId: atorId,
        dadosAnteriores: { status: t.status }, dadosNovos: { status: "ABERTO" } } });
    }
    return tx.viagem.update({ where: { id }, data: { status: "PROGRAMADA" } });
  });
}
