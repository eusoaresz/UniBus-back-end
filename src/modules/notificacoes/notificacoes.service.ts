import type { z } from "zod";
import type { Prisma } from "../../../generated/prisma";
import { prisma } from "../../../lib/prisma";
import { HttpError } from "../../shared/errors/http-error";
import { executarTransacao } from "../carteira/carteira.financeiro";
import { notificacaoSelect, preferenciasSelect } from "./notificacoes.dto";
import { temas, preferenciasPadrao, type Tema, type preferenciasSchema, type listaSchema } from "./notificacoes.schemas";

export async function consultarPreferencias(usuarioId: string) {
  return await prisma.preferenciasNotificacao.findUnique({ where: { usuarioId }, select: preferenciasSelect }) ?? { ...preferenciasPadrao };
}
export function atualizarPreferencias(usuarioId: string, dados: z.infer<typeof preferenciasSchema>) {
  return executarTransacao(prisma, async tx => {
    const preferencias = await tx.preferenciasNotificacao.upsert({ where: { usuarioId }, create: { usuarioId, ...dados }, update: dados, select: preferenciasSelect });
    const bloqueados = (Object.keys(temas) as Tema[]).filter(tema => !preferencias.ativadas || !preferencias[temas[tema]]);
    if (bloqueados.length) {
      await tx.notificacao.updateMany({ where: { usuarioId, tema: { in: bloqueados }, alertaHabilitado: true }, data: { alertaHabilitado: false } });
      await tx.entregaNotificacao.updateMany({ where: { notificacao: { usuarioId, tema: { in: bloqueados } }, status: { in: ["PENDENTE", "FALHOU"] } }, data: { status: "CANCELADA" } });
    }
    return preferencias;
  });
}

export async function registrarNotificacao(tx: Prisma.TransactionClient, dados: {
  usuarioId: string; chaveDeduplicacao: string; tipo: string; tema: Tema; titulo: string; mensagem: string; avisoId?: string;
}) {
  const pref = await tx.preferenciasNotificacao.findUnique({ where: { usuarioId: dados.usuarioId }, select: preferenciasSelect }) ?? preferenciasPadrao;
  return tx.notificacao.upsert({ where: { chaveDeduplicacao: dados.chaveDeduplicacao }, update: {}, create: {
    ...dados, alertaHabilitado: pref.ativadas && pref[temas[dados.tema]],
  } });
}

export function temaOperacional(chave: string): Tema {
  const prefixo = chave.split(":")[0];
  if (prefixo === "confirmacao") return "CONFIRMACOES";
  if (prefixo === "cancelamento") return "CANCELAMENTOS";
  if (prefixo === "rota") return "ALTERACOES_ROTA";
  if (prefixo === "horario") return "LEMBRETES";
  if (prefixo === "saldo-fila") return "CARTEIRA";
  if (["justificativa", "advertencia", "analise-falta", "liberacao"].includes(prefixo)) return "DISCIPLINA";
  return "OPERACAO";
}

async function filtro(usuarioId: string, alertas: boolean, tema?: Tema): Promise<Prisma.NotificacaoWhereInput> {
  const pref = await consultarPreferencias(usuarioId);
  const permitidos = (Object.keys(temas) as Tema[]).filter(t => pref.ativadas && pref[temas[t]]);
  return { usuarioId, ...(alertas ? { alertaHabilitado: true, tema: { in: tema ? permitidos.filter(t => t === tema) : permitidos } } : { tema }),
    OR: [{ avisoId: null }, { aviso: { ativo: true, publicadoEm: { lte: new Date() }, AND: [
      { OR: [{ expiraEm: null }, { expiraEm: { gt: new Date() } }] },
      { OR: [{ publicoPerfil: null }, { publicoPerfil: (await prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId }, select: { perfil: true } })).perfil }] },
    ] } }] };
}
export async function listar(usuarioId: string, consulta: z.infer<typeof listaSchema>, alertas = false) {
  const where = { ...await filtro(usuarioId, alertas, consulta.tema), ...(consulta.somenteNaoLidas ? { lidaEm: null } : {}) };
  const dados = await prisma.notificacao.findMany({ where, select: notificacaoSelect, skip: (consulta.pagina - 1) * consulta.limite,
    take: consulta.limite + 1, orderBy: [{ criadoEm: "desc" }, { id: "desc" }] });
  return { dados: dados.slice(0, consulta.limite), meta: { pagina: consulta.pagina, limite: consulta.limite, temProxima: dados.length > consulta.limite } };
}
export async function naoLidas(usuarioId: string) {
  return { quantidade: await prisma.notificacao.count({ where: { ...await filtro(usuarioId, true), lidaEm: null } }) };
}
export async function marcarLida(usuarioId: string, id: string) {
  const where = { ...await filtro(usuarioId, false), id };
  await prisma.notificacao.updateMany({ where: { ...where, lidaEm: null }, data: { lidaEm: new Date() } });
  const registro = await prisma.notificacao.findFirst({ where, select: notificacaoSelect });
  if (!registro) throw new HttpError(404, "Notificação não encontrada");
  return registro;
}
