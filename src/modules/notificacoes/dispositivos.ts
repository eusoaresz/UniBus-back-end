import type { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { HttpError } from "../../shared/errors/http-error";
import { executarTransacao } from "../carteira/carteira.financeiro";
import { configuracaoWebPush, type inscricaoWebSchema } from "./envio";

const publico = { id: true, plataforma: true, ativo: true, criadoEm: true, atualizadoEm: true } as const;
export function configuracaoPublica() {
  const config = configuracaoWebPush();
  return { habilitado: !!config, chavePublica: config?.publicKey ?? null };
}
export function registrarNavegador(usuarioId: string, sessaoHash: string, dados: z.infer<typeof inscricaoWebSchema>) {
  if (!configuracaoWebPush()) throw new HttpError(503, "Web Push ainda não habilitado");
  if (dados.expirationTime != null && dados.expirationTime <= Date.now()) throw new HttpError(400, "Inscrição expirada");
  return executarTransacao(prisma, async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Usuario" WHERE "id" = ${usuarioId}::uuid FOR UPDATE`;
    const anterior = await tx.dispositivoUsuario.findUnique({ where: { webEndpoint: dados.endpoint } });
    if (anterior && anterior.usuarioId !== usuarioId) throw new HttpError(409, "Refaça a inscrição do navegador para esta conta");
    if ((!anterior || !anterior.ativo) && await tx.dispositivoUsuario.count({ where: { usuarioId, plataforma: "WEB", ativo: true } }) >= 10)
      throw new HttpError(409, "Limite de dez navegadores ativos atingido");
    if (anterior && (!anterior.ativo || anterior.webP256dh !== dados.keys.p256dh || anterior.webAuth !== dados.keys.auth)) {
      await tx.entregaNotificacao.updateMany({ where: { dispositivoId: anterior.id, status: { in: ["PENDENTE", "FALHOU", "PROCESSANDO"] } }, data: { status: "CANCELADA" } });
    }
    const alteracao = { plataforma: "WEB", ativo: true, sessaoHash, webP256dh: dados.keys.p256dh, webAuth: dados.keys.auth,
      expiraEm: dados.expirationTime == null ? null : new Date(dados.expirationTime) };
    return tx.dispositivoUsuario.upsert({ where: { webEndpoint: dados.endpoint },
      create: { usuarioId, webEndpoint: dados.endpoint, ...alteracao }, update: alteracao, select: publico });
  });
}
export function listarNavegadores(usuarioId: string) {
  return prisma.dispositivoUsuario.findMany({ where: { usuarioId, plataforma: "WEB", ativo: true }, select: publico, orderBy: { criadoEm: "desc" } });
}
export function removerNavegador(usuarioId: string, id: string) {
  return executarTransacao(prisma, async tx => {
    const d = await tx.dispositivoUsuario.findFirst({ where: { id, usuarioId, plataforma: "WEB" } });
    if (!d) throw new HttpError(404, "Navegador não encontrado");
    await tx.dispositivoUsuario.update({ where: { id }, data: { ativo: false, sessaoHash: null } });
    await tx.entregaNotificacao.updateMany({ where: { dispositivoId: id, status: { in: ["PENDENTE", "FALHOU", "PROCESSANDO"] } }, data: { status: "CANCELADA" } });
    return { removido: true };
  });
}
