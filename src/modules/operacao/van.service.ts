import { prisma } from "../../../lib/prisma";
import { transacao, trechoTx, exigir, notificar, notificarOperadores } from "./operacao.shared";
import { alocarTx, validarRecurso } from "./recursos.service";
import { promoverTx } from "./participacoes.service";
import { expirarEsperaTx } from "./execucao.service";

export function solicitarVan(trechoId: string, motoristaId: string, veiculoId: string, minutos: number, operadorId: string) {
  return transacao(async (tx) => {
    const t = await trechoTx(tx, trechoId), agora = new Date();
    exigir(["ABERTO", "FECHADO"].includes(t.status) && agora >= new Date(t.saidaPrevistaEm.getTime() - 3600000) && agora < t.saidaPrevistaEm, "Avalie a van na última hora antes da saída");
    exigir(await tx.participacaoTrecho.count({ where: { trechoId, status: "EM_ESPERA" } }) > 0, "Não há demanda em espera");
    exigir(!await tx.convocacaoVan.findFirst({ where: { trechoId, status: "PENDENTE" } }), "Já existe uma convocação pendente");
    exigir(motoristaId !== t.motoristaId && veiculoId !== t.veiculoId, "A van deve ter recursos diferentes do ônibus");
    const { motorista, veiculo } = await validarRecurso(tx, t, motoristaId, veiculoId);
    exigir(veiculo.tipo === "VAN", "O veículo indicado não é uma van");
    const convocacao = await tx.convocacaoVan.create({ data: { trechoId, motoristaId, veiculoId,
      solicitadaPorId: operadorId, responderAte: new Date(Math.min(agora.getTime() + minutos * 60000, t.saidaPrevistaEm.getTime())) } });
    await notificar(tx, motorista.usuarioId, `convocacao:${convocacao.id}`, "Solicitação de van", `Responda até ${convocacao.responderAte.toISOString()}.`);
    return convocacao;
  });
}

export function responderVan(id: string, usuarioId: string, aceitar: boolean) {
  return transacao(async (tx) => {
    const c = await tx.convocacaoVan.findFirst({ where: { id, motorista: { usuarioId } } });
    exigir(c, "Convocação não encontrada", 404);
    if (["ACEITA", "RECUSADA"].includes(c.status)) {
      exigir(c.status === (aceitar ? "ACEITA" : "RECUSADA"), "Convocação já respondida com outra decisão");
      return c;
    }
    const agora = new Date();
    exigir(c.status === "PENDENTE" && agora <= c.responderAte, "Convocação expirada ou indisponível");
    const t = await trechoTx(tx, c.trechoId);
    exigir(!t.iniciadoEm && agora < t.saidaPrevistaEm && ["ABERTO", "FECHADO"].includes(t.status), "Trecho indisponível");
    if (aceitar) {
      exigir(t.motoristaId && t.veiculoId, "Aloque o veículo principal");
      await alocarTx(tx, t.id, { motoristaId: t.motoristaId, veiculoId: t.veiculoId,
        motoristaExtraId: c.motoristaId, veiculoExtraId: c.veiculoId, motivo: "Aceite da convocação de van pelo motorista" }, usuarioId);
      await promoverTx(tx, t.id, agora);
    }
    const atual = await tx.convocacaoVan.update({ where: { id }, data: { status: aceitar ? "ACEITA" : "RECUSADA", respondidaEm: agora } });
    await notificarOperadores(tx, `resposta-van:${id}`, aceitar ? "Van aceita" : "Van recusada",
      aceitar ? "Confira a fila e confirme os próximos elegíveis. Após o prazo, a confirmação exige ação do operador."
        : "Avalie outro motorista ou outra van local. Não há transporte adicional confirmado.");
    return atual;
  });
}

export async function processarPrazos() {
  const agora = new Date();
  const candidatos = await prisma.trechoViagem.findMany({ where: {
    status: { in: ["ABERTO", "FECHADO"] },
    OR: [{ status: "ABERTO" }, { participacoes: { some: { status: "EM_ESPERA" } } }, { convocacoes: { some: { status: "PENDENTE" } } }],
  }, select: { id: true }, orderBy: { id: "asc" } });
  for (const { id } of candidatos) await transacao(async (tx) => {
    const t = await trechoTx(tx, id);
    if (!["ABERTO", "FECHADO"].includes(t.status)) return;
    if (agora < new Date(t.saidaPrevistaEm.getTime() - 3600000)) {
      await promoverTx(tx, id, agora);
      return;
    }
    if (agora > t.limiteConfirmacaoEm && t.status === "ABERTO") {
      await tx.trechoViagem.update({ where: { id }, data: { status: "FECHADO", inscricoesSuspensas: true } });
    }
    for (const c of await tx.convocacaoVan.findMany({ where: { trechoId: id, status: "PENDENTE", responderAte: { lt: agora } } })) {
      await tx.convocacaoVan.update({ where: { id: c.id }, data: { status: "EXPIRADA", respondidaEm: agora } });
      await notificarOperadores(tx, `van-expirada:${c.id}`, "Van sem resposta", "Prazo encerrado. Avalie outra van ou comunique indisponibilidade aos estudantes.");
    }
    if (agora >= t.saidaPrevistaEm) { await expirarEsperaTx(tx, id); return; }
    const espera = await tx.participacaoTrecho.count({ where: { trechoId: id, status: "EM_ESPERA" } });
    if (espera) await notificarOperadores(tx, `avaliar-van:${id}:${t.saidaPrevistaEm.toISOString()}`, "Avaliar transporte adicional",
      `${espera} estudante(s) em espera. Avalie a disponibilidade de van antes da saída.`);
  });
  return { trechosProcessados: candidatos.length };
}

export function avisarIndisponibilidade(id: string, motivo: string, operadorId: string) {
  return transacao(async (tx) => {
    const t = await trechoTx(tx, id);
    exigir(["ABERTO", "FECHADO"].includes(t.status), "Trecho indisponível");
    const espera = await tx.participacaoTrecho.findMany({ where: { trechoId: id, status: "EM_ESPERA" }, include: { estudante: { select: { usuarioId: true } } } });
    for (const p of espera) await notificar(tx, p.estudante.usuarioId, `sem-transporte:${id}:${p.id}:${p.ordemFila}`, "Sem transporte adicional no momento", motivo);
    await tx.alteracaoTrecho.create({ data: { trechoId: id, motivo, realizadaPorId: operadorId,
      dadosAnteriores: { espera: espera.length }, dadosNovos: { avisoIndisponibilidade: true } } });
    return { avisados: espera.length };
  });
}
