import type { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { semestreSchema } from "./operacao.schemas";
import { transacao, exigir, notificar, cancelarTx, type Tx } from "./operacao.shared";
import { promoverTx } from "./participacoes.service";

export function criarSemestre(dados: z.infer<typeof semestreSchema>, operadorId: string) {
  return transacao(async (tx) => {
    const inicio = new Date(dados.inicio), fim = new Date(dados.fim);
    exigir(!await tx.semestreLetivo.findFirst({ where: { inicio: { lt: fim }, fim: { gt: inicio } } }), "Semestres não podem se sobrepor");
    return tx.semestreLetivo.create({ data: { nome: dados.nome, inicio, fim, criadoPorId: operadorId } });
  });
}

export async function avaliarDisciplinaTx(tx: Tx, estudanteId: string, semestreId: string, operadorId: string) {
  const e = await tx.estudante.findUniqueOrThrow({ where: { id: estudanteId }, select: { usuarioId: true } });
  const semestre = await tx.semestreLetivo.findUniqueOrThrow({ where: { id: semestreId } });
  const faltas = await tx.falta.count({ where: { estudanteId, semestreId, justificada: false } });
  if (faltas >= 3) await notificar(tx, e.usuarioId, `justificativa:${estudanteId}:${semestreId}`,
    "Justificativa solicitada", "Você atingiu três faltas contabilizadas neste semestre. Apresente uma justificativa para análise.");
  for (const [indice, limite] of [4, 8, 12].entries()) {
    if (faltas < limite) continue;
    const numero = indice + 1;
    const advertencia = await tx.advertencia.upsert({ where: { estudanteId_semestreId_numero: { estudanteId, semestreId, numero } },
      update: {}, create: { estudanteId, semestreId, numero } });
    await notificar(tx, e.usuarioId, `advertencia:${advertencia.id}`, `${numero}ª advertência`,
      numero === 1 ? "Advertência por faltas contabilizadas no semestre."
        : numero === 2 ? "Novas confirmações estão bloqueadas. Seu login e participações confirmadas permanecem válidos."
          : "Acesso bloqueado. Participações futuras foram canceladas e estornadas. Procure a secretaria.");
    if (numero !== 3 || advertencia.liberadaEm || semestre.fim <= new Date()) continue;
    await tx.usuario.update({ where: { id: e.usuarioId }, data: { bloqueioDisciplinarAte: semestre.fim } });
    const futuras = await tx.participacaoTrecho.findMany({ where: { estudanteId,
      status: { in: ["CONFIRMADA", "EM_ESPERA"] }, trecho: { iniciadoEm: null, status: { in: ["ABERTO", "FECHADO"] } } } });
    for (const p of futuras) await cancelarTx(tx, p.id, operadorId, "Cancelamento por terceira advertência disciplinar");
    for (const trechoId of new Set(futuras.map((p) => p.trechoId))) await promoverTx(tx, trechoId, new Date());
  }
  return { faltasContabilizadas: faltas };
}

export function justificarFalta(id: string, usuarioId: string, justificativa: string) {
  return transacao(async (tx) => {
    const falta = await tx.falta.findFirst({ where: { id, estudante: { usuarioId } } });
    exigir(falta, "Falta não encontrada", 404);
    exigir(!falta.analisadoEm, "Justificativa já analisada; solicite revisão ao operador");
    return tx.falta.update({ where: { id }, data: { justificativa } });
  });
}

export function analisarFalta(id: string, operadorId: string, aprovar: boolean, motivo: string) {
  return transacao(async (tx) => {
    const falta = await tx.falta.findUnique({ where: { id }, include: { estudante: { select: { usuarioId: true } } } });
    exigir(falta, "Falta não encontrada", 404);
    exigir(falta.justificativa, "O estudante ainda não apresentou justificativa");
    if (falta.analisadoEm) {
      exigir(falta.justificada === aprovar && falta.motivoAnalise === motivo, "Justificativa já analisada com decisão diferente");
      return falta;
    }
    const atual = await tx.falta.update({ where: { id }, data: { justificada: aprovar,
      analisadoEm: new Date(), analisadoPorId: operadorId, motivoAnalise: motivo } });
    await notificar(tx, falta.estudante.usuarioId, `analise-falta:${id}`, "Justificativa analisada",
      aprovar ? "Justificativa aprovada. A falta permanece no histórico, sem contar para disciplina. Advertências exigem revisão manual."
        : `Justificativa rejeitada: ${motivo}`);
    return atual;
  });
}

export function liberarDisciplina(estudanteId: string, semestreId: string, operadorId: string, motivo: string) {
  return transacao(async (tx) => {
    const e = await tx.estudante.findUnique({ where: { id: estudanteId }, select: { usuarioId: true } });
    const semestre = await tx.semestreLetivo.findUnique({ where: { id: semestreId } });
    exigir(e && semestre, "Estudante ou semestre não encontrado", 404);
    await tx.advertencia.updateMany({ where: { estudanteId, semestreId, liberadaEm: null },
      data: { liberadaEm: new Date(), liberadaPorId: operadorId, motivoLiberacao: motivo } });
    await tx.usuario.updateMany({ where: { id: e.usuarioId, bloqueioDisciplinarAte: semestre.fim }, data: { bloqueioDisciplinarAte: null } });
    await notificar(tx, e.usuarioId, `liberacao:${estudanteId}:${semestreId}`, "Disciplina revisada", motivo);
    return { estudanteId, semestreId, liberado: true };
  });
}

export function minhasFaltas(usuarioId: string, pagina: number, limite: number) {
  return prisma.falta.findMany({ where: { estudante: { usuarioId } }, skip: (pagina - 1) * limite, take: limite,
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }], select: {
      id: true, participacaoId: true, semestreId: true, justificativa: true, justificada: true,
      analisadoEm: true, motivoAnalise: true, criadoEm: true,
    } });
}
