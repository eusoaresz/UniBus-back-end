import { prisma } from "../../../lib/prisma";
import { executarTransacao } from "../carteira/carteira.financeiro";
import { registrarNotificacao } from "./notificacoes.service";

export async function processarNotificacoes(agora = new Date()) {
  let cursor: string | undefined;
  do {
    const usuarios = await prisma.usuario.findMany({ where: { status: "ATIVA" }, orderBy: { id: "asc" }, take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true } });
    for (const usuario of usuarios) await executarTransacao(prisma, async tx => {
      const atual = await tx.usuario.findUniqueOrThrow({ where: { id: usuario.id }, select: { perfil: true, status: true } });
      if (atual.status !== "ATIVA") return;
      const avisos = await tx.aviso.findMany({ where: { ativo: true, publicadoEm: { lte: agora }, AND: [
        { OR: [{ expiraEm: null }, { expiraEm: { gt: agora } }] },
        { OR: [{ publicoPerfil: null }, { publicoPerfil: atual.perfil }] },
      ], notificacoes: { none: { usuarioId: usuario.id } } }, take: 100, orderBy: [{ publicadoEm: "asc" }, { id: "asc" }],
        select: { id: true, titulo: true, mensagem: true } });
      for (const aviso of avisos) await registrarNotificacao(tx, { usuarioId: usuario.id, avisoId: aviso.id,
        chaveDeduplicacao: `aviso:${aviso.id}:${usuario.id}`, tipo: "AVISO", tema: "AVISOS_OPERADOR", titulo: aviso.titulo, mensagem: aviso.mensagem });
    });
    cursor = usuarios.length === 100 ? usuarios[usuarios.length - 1].id : undefined;
  } while (cursor);

  let participacaoCursor: string | undefined;
  do {
    const registros = await prisma.participacaoTrecho.findMany({ where: { status: "CONFIRMADA",
      estudante: { statusCadastro: "APROVADO", usuario: { status: "ATIVA" } },
      trecho: { status: { in: ["ABERTO", "FECHADO"] }, iniciadoEm: null,
        saidaPrevistaEm: { gt: agora, lte: new Date(agora.getTime() + 30 * 60000) } } },
      ...(participacaoCursor ? { cursor: { id: participacaoCursor }, skip: 1 } : {}), take: 100, orderBy: { id: "asc" },
      select: { id: true } });
    for (const registro of registros) await executarTransacao(prisma, async tx => {
      const p = await tx.participacaoTrecho.findUniqueOrThrow({ where: { id: registro.id },
        include: { estudante: { select: { usuarioId: true } }, trecho: { select: { saidaPrevistaEm: true, status: true, iniciadoEm: true } } } });
      if (p.status !== "CONFIRMADA" || p.trecho.iniciadoEm || !["ABERTO", "FECHADO"].includes(p.trecho.status) || p.trecho.saidaPrevistaEm <= agora) return;
      await registrarNotificacao(tx, { usuarioId: p.estudante.usuarioId, tipo: "LEMBRETE", tema: "LEMBRETES",
        chaveDeduplicacao: `lembrete:${p.id}:${p.cicloConfirmacao}:${p.trecho.saidaPrevistaEm.toISOString()}`,
        titulo: "Sua viagem está próxima", mensagem: `Confira seu embarque para a saída às ${p.trecho.saidaPrevistaEm.toISOString()}.` });
    });
    participacaoCursor = registros.length === 100 ? registros[registros.length - 1].id : undefined;
  } while (participacaoCursor);
}
