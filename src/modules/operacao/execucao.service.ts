import jwt from "jsonwebtoken";
import type { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { JWT_SECRET } from "../auth/auth.config";
import { embarqueSchema, reabrirSchema } from "./operacao.schemas";
import { transacao, trechoTx, exigir, notificar, cancelarTx, atualizarViagem, semestreTx, type Ator, type Tx } from "./operacao.shared";
import { avaliarDisciplinaTx } from "./disciplina.service";
import { validarRecurso } from "./recursos.service";

export async function expirarEsperaTx(tx: Tx, trechoId: string) {
  for (const p of await tx.participacaoTrecho.findMany({ where: { trechoId, status: "EM_ESPERA" }, include: { estudante: { select: { usuarioId: true } } } })) {
    await tx.participacaoTrecho.update({ where: { id: p.id }, data: { status: "EXPIRADA", alocacao: null } });
    await tx.alteracaoParticipacao.create({ data: { participacaoId: p.id, acao: "EXPIRACAO", dadosNovos: { status: "EXPIRADA" } } });
    await notificar(tx, p.estudante.usuarioId, `espera-expirada:${p.id}:${p.ordemFila}`, "Inscrição expirada", "Não houve vaga confirmada até a saída. Nenhuma passagem foi cobrada por esta espera.");
  }
}

export function iniciar(id: string, operadorId: string) {
  return transacao(async (tx) => {
    const t = await trechoTx(tx, id);
    if (t.status === "EM_ANDAMENTO") return t;
    exigir(["ABERTO", "FECHADO"].includes(t.status), "Trecho não pode ser iniciado");
    exigir(t.motoristaId && t.veiculoId, "Recursos ausentes");
    await validarRecurso(tx, t, t.motoristaId, t.veiculoId);
    if (t.motoristaExtraId && t.veiculoExtraId) await validarRecurso(tx, t, t.motoristaExtraId, t.veiculoExtraId);
    await semestreTx(tx, t.saidaPrevistaEm);
    await expirarEsperaTx(tx, id);
    await tx.convocacaoVan.updateMany({ where: { trechoId: id, status: "PENDENTE" }, data: { status: "CANCELADA", respondidaEm: new Date() } });
    const atual = await tx.trechoViagem.update({ where: { id }, data: { status: "EM_ANDAMENTO", iniciadoEm: new Date(), inscricoesSuspensas: true } });
    await tx.alteracaoTrecho.create({ data: { trechoId: id, motivo: "Início do trecho", realizadaPorId: operadorId,
      dadosAnteriores: { status: t.status }, dadosNovos: { status: atual.status } } });
    await atualizarViagem(tx, t.viagemId);
    return atual;
  });
}

export function concluir(id: string, operadorId: string) {
  return transacao(async (tx) => {
    const t = await trechoTx(tx, id);
    if (t.status === "CONCLUIDO") return t;
    exigir(t.status === "EM_ANDAMENTO", "Inicie o trecho antes de concluir");
    const semestre = await semestreTx(tx, t.saidaPrevistaEm);
    const ausentes = await tx.participacaoTrecho.findMany({ where: { trechoId: id, status: "CONFIRMADA",
      embarques: { none: { status: "REGISTRADO" } } } });
    for (const p of ausentes) {
      await tx.falta.upsert({ where: { participacaoId: p.id }, update: {}, create: { participacaoId: p.id,
        estudanteId: p.estudanteId, semestreId: semestre.id } });
    }
    await tx.trechoViagem.update({ where: { id }, data: { status: "CONCLUIDO", concluidoEm: new Date() } });
    for (const estudanteId of new Set(ausentes.map((p) => p.estudanteId))) await avaliarDisciplinaTx(tx, estudanteId, semestre.id, operadorId);
    await atualizarViagem(tx, t.viagemId);
    await tx.alteracaoTrecho.create({ data: { trechoId: id, motivo: "Conclusão do trecho e apuração de faltas", realizadaPorId: operadorId,
      dadosAnteriores: { status: t.status }, dadosNovos: { status: "CONCLUIDO", faltas: ausentes.length } } });
    return { trechoId: id, status: "CONCLUIDO", faltas: ausentes.length };
  });
}

async function cancelarTrechoTx(tx: Tx, id: string, operadorId: string, motivo: string) {
  const t = await trechoTx(tx, id);
  if (t.status === "CANCELADO") return;
  exigir(!t.iniciadoEm && !["EM_ANDAMENTO", "CONCLUIDO"].includes(t.status), "Interrupção de trecho iniciado exige análise manual");
  for (const p of await tx.participacaoTrecho.findMany({ where: { trechoId: id, status: { in: ["CONFIRMADA", "EM_ESPERA"] } } })) {
    await cancelarTx(tx, p.id, operadorId, motivo);
  }
  await tx.trechoViagem.update({ where: { id }, data: { status: "CANCELADO", canceladoEm: new Date(), motivoCancelamento: motivo, canceladoPorId: operadorId } });
  await tx.convocacaoVan.updateMany({ where: { trechoId: id, status: "PENDENTE" }, data: { status: "CANCELADA", respondidaEm: new Date() } });
  await atualizarViagem(tx, t.viagemId);
}
export const cancelarTrecho = (id: string, operadorId: string, motivo: string) => transacao(async (tx) => {
  await cancelarTrechoTx(tx, id, operadorId, motivo); return { trechoId: id, status: "CANCELADO" };
});
export const cancelarViagem = (id: string, operadorId: string, motivo: string) => transacao(async (tx) => {
  const viagem = await tx.viagem.findUnique({ where: { id }, include: { trechos: true } });
  exigir(viagem, "Viagem não encontrada", 404);
  for (const t of viagem.trechos) await cancelarTrechoTx(tx, t.id, operadorId, motivo);
  return tx.viagem.update({ where: { id }, data: { status: "CANCELADA", canceladaEm: new Date(), canceladaPorId: operadorId, motivoCancelamento: motivo } });
});

export function alterarHorario(id: string, dados: z.infer<typeof reabrirSchema>, operadorId: string) {
  return transacao(async (tx) => {
    const t = await trechoTx(tx, id);
    exigir(["ABERTO", "FECHADO"].includes(t.status) && !t.iniciadoEm, "Trecho não permite mudança de horário");
    const saida = new Date(dados.saidaPrevistaEm), chegada = new Date(dados.chegadaPrevistaEm);
    if (t.sentido === "IDA") {
      const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(saida);
      const local = ["year", "month", "day"].map((tipo) => partes.find((p) => p.type === tipo)!.value).join("-");
      exigir(local === t.viagem.data.toISOString().slice(0, 10), "Mudança de horário deve preservar a data da viagem");
    }
    const limite = new Date(saida.getTime() - 3600000);
    exigir(saida > new Date(), "Saída deve estar no futuro");
    if (dados.reabrir) exigir(limite > new Date(), "Novo prazo precisa estar no futuro para reabrir");
    const outro = await tx.trechoViagem.findFirst({ where: { viagemId: t.viagemId, id: { not: id } } });
    if (outro) exigir(t.sentido === "IDA" ? chegada <= outro.saidaPrevistaEm : saida >= outro.chegadaPrevistaEm, "Ida e volta não podem se sobrepor");
    const proposta = { ...t, saidaPrevistaEm: saida, chegadaPrevistaEm: chegada };
    if (t.motoristaId && t.veiculoId) await validarRecurso(tx, proposta, t.motoristaId, t.veiculoId);
    if (t.motoristaExtraId && t.veiculoExtraId) await validarRecurso(tx, proposta, t.motoristaExtraId, t.veiculoExtraId);
    await semestreTx(tx, saida);
    const jaFechado = t.inscricoesSuspensas || t.status === "FECHADO" || new Date() > t.limiteConfirmacaoEm;
    const suspensas = dados.reabrir ? false : jaFechado;
    const atual = await tx.trechoViagem.update({ where: { id }, data: {
      saidaPrevistaEm: saida, chegadaPrevistaEm: chegada, limiteConfirmacaoEm: limite,
      limiteCancelamentoEm: limite, inscricoesSuspensas: suspensas, status: suspensas ? "FECHADO" : "ABERTO",
    } });
    for (const p of await tx.participacaoTrecho.findMany({ where: { trechoId: id, status: { in: ["CONFIRMADA", "EM_ESPERA"] } }, include: { estudante: { select: { usuarioId: true } } } })) {
      await notificar(tx, p.estudante.usuarioId, `horario:${id}:${atual.atualizadoEm.toISOString()}:${p.id}`, "Horário alterado", `Confira o novo horário: ${saida.toISOString()}.`);
    }
    await tx.alteracaoTrecho.create({ data: { trechoId: id, realizadaPorId: operadorId, motivo: dados.motivo,
      dadosAnteriores: JSON.parse(JSON.stringify(t)), dadosNovos: JSON.parse(JSON.stringify(atual)) } });
    return atual;
  });
}

export async function gerarQr(id: string, usuarioId: string) {
  const p = await prisma.participacaoTrecho.findFirst({ where: { id, estudante: { usuarioId } }, include: { trecho: true } });
  exigir(p && p.status === "CONFIRMADA" && ["ABERTO", "FECHADO", "EM_ANDAMENTO"].includes(p.trecho.status), "Participação não permite QR Code", 404);
  const exp = Math.floor(p.trecho.chegadaPrevistaEm.getTime() / 1000) + 21600;
  exigir(exp > Math.floor(Date.now() / 1000), "QR Code expirado");
  return { qr: jwt.sign({ participacaoId: p.id, ciclo: p.cicloConfirmacao, exp }, JWT_SECRET,
    { algorithm: "HS256", audience: "unibus-embarque" }), expiraEm: new Date(exp * 1000) };
}

export async function autorizarMotoristaTx(tx: Tx, t: Awaited<ReturnType<typeof trechoTx>>, ator: Ator, alocacao?: string | null) {
  exigir(["MOTORISTA", "OPERADOR"].includes(ator.perfil), "Acesso restrito a motorista ou operador", 403);
  if (ator.perfil === "OPERADOR") return;
  const m = await tx.motorista.findUnique({ where: { usuarioId: ator.id }, select: { id: true } });
  exigir(m && (alocacao === "VEICULO" ? m.id === t.motoristaId : alocacao === "EXTRA" ? m.id === t.motoristaExtraId
    : [t.motoristaId, t.motoristaExtraId].includes(m.id)), "Motorista não está atribuído a este atendimento", 403);
}

export function embarcar(trechoId: string, dados: z.infer<typeof embarqueSchema>, ator: Ator) {
  return transacao(async (tx) => {
    let id = dados.participacaoId, ciclo: number | undefined;
    if (dados.qr) {
      try {
        const qr = jwt.verify(dados.qr, JWT_SECRET, { algorithms: ["HS256"], audience: "unibus-embarque" });
        exigir(typeof qr !== "string" && typeof qr.participacaoId === "string" && Number.isInteger(qr.ciclo), "QR Code inválido", 400);
        id = qr.participacaoId; ciclo = qr.ciclo;
      } catch { exigir(false, "QR Code inválido ou expirado", 400); }
    }
    const t = await trechoTx(tx, trechoId);
    exigir(t.status === "EM_ANDAMENTO", "Embarque exige trecho em andamento");
    const p = await tx.participacaoTrecho.findFirst({ where: { id, trechoId }, include: { estudante: { include: { usuario: true } } } });
    exigir(p && p.status === "CONFIRMADA" && p.alocacao, "Participação não confirmada ou cancelada", 404);
    exigir(ciclo === undefined || ciclo === p.cicloConfirmacao, "QR Code pertence a confirmação anterior");
    exigir(p.estudante.usuario.status === "ATIVA" && (!p.estudante.usuario.bloqueioDisciplinarAte || p.estudante.usuario.bloqueioDisciplinarAte <= new Date()), "Estudante com acesso bloqueado");
    await autorizarMotoristaTx(tx, t, ator, p.alocacao);
    const motoristaId = p.alocacao === "VEICULO" ? t.motoristaId : t.motoristaExtraId;
    const veiculoId = p.alocacao === "VEICULO" ? t.veiculoId : t.veiculoExtraId;
    exigir(motoristaId && veiculoId, "Alocação incompleta");
    const chave = `embarque:${p.id}:${p.cicloConfirmacao}`;
    const existente = await tx.embarque.findUnique({ where: { chaveIdempotencia: chave } });
    if (existente) return { id: existente.id, status: existente.status, participacaoId: p.id };
    const embarque = await tx.embarque.create({ data: { participacaoId: p.id, motoristaId, veiculoId,
      registradoPorId: ator.id, chaveIdempotencia: chave } });
    return { id: embarque.id, status: embarque.status, participacaoId: p.id };
  });
}

export function passageiros(id: string, ator: Ator, pagina: number, limite: number) {
  return transacao(async (tx) => {
    const t = await trechoTx(tx, id);
    await autorizarMotoristaTx(tx, t, ator);
    const m = ator.perfil === "MOTORISTA" ? await tx.motorista.findUniqueOrThrow({ where: { usuarioId: ator.id } }) : null;
    return tx.participacaoTrecho.findMany({ where: { trechoId: id, status: "CONFIRMADA",
      alocacao: m ? (m.id === t.motoristaId ? "VEICULO" : "EXTRA") : undefined },
      skip: (pagina - 1) * limite, take: limite, orderBy: { ordemFila: "asc" },
      select: { id: true, origemId: true, destinoId: true, alocacao: true,
        estudante: { select: { matricula: true, usuario: { select: { nome: true } } } },
        embarques: { where: { status: "REGISTRADO" }, select: { id: true, registradoEm: true } } } });
  });
}
