import { prisma } from "../../../lib/prisma";
import { executarTransacao } from "../carteira/carteira.financeiro";
import { preferenciasPadrao, temas, type Tema } from "./notificacoes.schemas";
import { configuracaoWebPush, enviarWebPush } from "./envio";

const HORA = 3600000;
const LEASE = 5 * 60000;
// ENVIADA significa aceita pelo provedor, não leitura nem exibição garantida.
export async function processarWebPush(agora = new Date(), enviar = enviarWebPush) {
  const inicioReal = Date.now();
  const instanteAtual = () => new Date(agora.getTime() + Date.now() - inicioReal);
  if (!configuracaoWebPush()) return;
  await prisma.entregaNotificacao.updateMany({ where: { canal: "PUSH", destino: "WEB", status: "PROCESSANDO", tentativas: { gte: 5 },
    processandoDesdeEm: { lt: new Date(agora.getTime() - LEASE) } }, data: { status: "FALHOU", processandoDesdeEm: null,
    proximaTentativaEm: null, ultimoErro: "LIMITE_TENTATIVAS" } });
  const elegiveis = {
    canal: "PUSH" as const, destino: "WEB", tentativas: { lt: 5 }, agendadaPara: { lte: agora },
    OR: [
      { status: "PENDENTE" as const },
      { status: "FALHOU" as const, proximaTentativaEm: { lte: agora } },
      { status: "PROCESSANDO" as const, processandoDesdeEm: { lt: new Date(agora.getTime() - LEASE) } },
    ],
  };
  const lote = await prisma.entregaNotificacao.findMany({ where: elegiveis, orderBy: [{ agendadaPara: "asc" }, { id: "asc" }], take: 50, select: { id: true } });
  for (const item of lote) {
    // O lote pode levar minutos: a reserva começa ao retirar cada item, não no início do lote.
    const reservadoEm = instanteAtual();
    const reserva = await prisma.entregaNotificacao.updateMany({ where: { id: item.id, ...elegiveis },
      data: { status: "PROCESSANDO", processandoDesdeEm: reservadoEm, tentativas: { increment: 1 }, proximaTentativaEm: null } });
    if (!reserva.count) continue;
    const entrega = await prisma.entregaNotificacao.findUniqueOrThrow({ where: { id: item.id }, include: {
      dispositivo: true, notificacao: { include: { aviso: true, usuario: { include: { preferenciasNotificacao: true, estudante: { select: { statusCadastro: true } } } } } },
    } });
    if (entrega.status !== "PROCESSANDO" || entrega.processandoDesdeEm?.getTime() !== reservadoEm.getTime()) continue;
    const atual = instanteAtual();
    const trava = { id: entrega.id, status: "PROCESSANDO" as const, processandoDesdeEm: reservadoEm, tentativas: entrega.tentativas };
    const n = entrega.notificacao, d = entrega.dispositivo, u = n.usuario, a = n.aviso;
    const pref = u.preferenciasNotificacao ?? preferenciasPadrao;
    const tema = temas[n.tema as Tema];
    const valido = entrega.status === "PROCESSANDO" && d?.ativo && d.plataforma === "WEB" && d.usuarioId === n.usuarioId &&
      d.webEndpoint && d.webP256dh && d.webAuth && (!d.expiraEm || d.expiraEm > atual) &&
      n.alertaHabilitado && !n.lidaEm && tema && pref.ativadas && pref[tema] &&
      u.status === "ATIVA" && (!u.bloqueioDisciplinarAte || u.bloqueioDisciplinarAte <= atual) && u.estudante?.statusCadastro !== "ENCERRADO" &&
      n.criadoEm.getTime() > atual.getTime() - HORA &&
      (!a || (a.ativo && a.publicadoEm <= atual && (!a.expiraEm || a.expiraEm > atual) && (!a.publicoPerfil || a.publicoPerfil === u.perfil)));
    if (!valido) {
      await prisma.entregaNotificacao.updateMany({ where: trava, data: { status: "CANCELADA", processandoDesdeEm: null } });
      continue;
    }
    try {
      // Conteúdo genérico evita expor finanças/disciplina na tela bloqueada ou em navegador compartilhado.
      await enviar({ endpoint: d.webEndpoint!, keys: { p256dh: d.webP256dh!, auth: d.webAuth! } }, JSON.stringify({
        titulo: "UniBus", mensagem: "Você tem uma nova notificação no UniBus.", notificacaoId: n.id, tag: `unibus:${n.id}`,
      }));
      await prisma.entregaNotificacao.updateMany({ where: trava, data: { status: "ENVIADA", enviadaEm: new Date(), processandoDesdeEm: null, ultimoErro: null } });
    } catch (erro) {
      const codigo = erro && typeof erro === "object" && "statusCode" in erro && typeof erro.statusCode === "number" ? erro.statusCode : null;
      const expirou = codigo === 404 || codigo === 410;
      const repetir = !expirou && (codigo === null || codigo === 429 || codigo >= 500) && entrega.tentativas < 5;
      await executarTransacao(prisma, async tx => {
        await tx.entregaNotificacao.updateMany({ where: trava, data: { status: expirou ? "CANCELADA" : "FALHOU", processandoDesdeEm: null,
          ultimoErro: codigo ? `HTTP_${codigo}` : "FALHA_TRANSPORTE", proximaTentativaEm: repetir ? new Date(instanteAtual().getTime() + 60000 * 2 ** (entrega.tentativas - 1)) : null } });
        if (expirou) {
          const desativado = await tx.dispositivoUsuario.updateMany({ where: { id: d.id, atualizadoEm: d.atualizadoEm }, data: { ativo: false, sessaoHash: null } });
          if (desativado.count) await tx.entregaNotificacao.updateMany({ where: { dispositivoId: d.id, status: { in: ["PENDENTE", "FALHOU"] } }, data: { status: "CANCELADA" } });
        }
      });
    }
  }
}

export function iniciarWebPushJob() {
  let executando = false;
  const executar = async () => {
    if (executando) return;
    executando = true;
    try { await processarWebPush(); }
    catch { console.error("Falha ao processar Web Push"); }
    finally { executando = false; }
  };
  void executar();
  setInterval(() => void executar(), 30000).unref();
}
