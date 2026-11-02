import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomInt, randomUUID } from "node:crypto";
import type { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { transporter, mailFrom } from "../../../lib/mailer";
import { HttpError } from "../../shared/errors/http-error";
import { JWT_SECRET } from "./auth.config";
import type { loginSchema, redefinirSchema } from "./auth.schemas";

// Mesmo custo de bcrypt para e-mail inexistente, sem gerar um hash a cada pedido.
const hashFicticio = bcrypt.hash("credencial-interna-sem-usuario", 10);
export const mensagemRecuperacao = "Se o e-mail estiver cadastrado, você receberá o código de recuperação.";

export async function login({ email, senha }: z.infer<typeof loginSchema>) {
  const emitidoEm = Date.now();
  const usuario = await prisma.usuario.findUnique({
    where: { email }, select: { id: true, senhaHash: true, status: true, bloqueioDisciplinarAte: true },
  });
  const valida = await bcrypt.compare(senha, usuario?.senhaHash ?? await hashFicticio);
  if (!usuario || !usuario.senhaHash || !valida) throw new HttpError(401, "Email ou senha inválidos");
  if (usuario.status !== "ATIVA" || (usuario.bloqueioDisciplinarAte && usuario.bloqueioDisciplinarAte > new Date())) throw new HttpError(403, "Conta sem permissão para acesso");
  return { token: jwt.sign({ id: usuario.id, emitidoEm }, JWT_SECRET, { algorithm: "HS256", jwtid: randomUUID(), expiresIn: "1h" }) };
}

export async function logout(usuarioId: string, tokenHash: string, expiraEm: Date) {
  await prisma.tokenRevogado.createMany({ data: [{ tokenHash, usuarioId, expiraEm }], skipDuplicates: true });
}

export async function recuperarSenha(email: string) {
  const usuario = await prisma.usuario.findUnique({ where: { email }, select: { id: true } });
  if (!usuario) return;
  const codigo = randomInt(100000, 1000000).toString();
  const tokenHash = await bcrypt.hash(codigo, 10);
  const token = await prisma.$transaction(async (tx) => {
    // Serializa emissões por usuário, inclusive quando dois reenvios chegam juntos.
    await tx.$queryRaw`SELECT "id" FROM "Usuario" WHERE "id" = ${usuario.id}::uuid FOR UPDATE`;
    await tx.tokenAcesso.updateMany({
      where: { usuarioId: usuario.id, tipo: "RECUPERACAO_SENHA", utilizadoEm: null },
      data: { utilizadoEm: new Date() },
    });
    return tx.tokenAcesso.create({ data: {
      usuarioId: usuario.id, tipo: "RECUPERACAO_SENHA", tokenHash,
      expiraEm: new Date(Date.now() + 15 * 60 * 1000),
    } });
  });
  try {
    await transporter.sendMail({ from: mailFrom, to: email, subject: "Código de Recuperação de Senha",
      text: `Seu código de recuperação é: ${codigo}. Ele expira em 15 minutos.` });
  } catch {
    await prisma.tokenAcesso.updateMany({ where: { id: token.id }, data: { utilizadoEm: new Date() } });
    // Resposta pública idêntica: falha SMTP não deve revelar existência da conta.
    console.error("Falha no envio de recuperação de senha");
  }
}

export async function redefinirSenha({ email, codigo, novaSenha }: z.infer<typeof redefinirSchema>) {
  const invalido = () => new HttpError(400, "Código inválido ou expirado");
  const usuario = await prisma.usuario.findUnique({ where: { email }, select: { id: true } });
  if (!usuario) throw invalido();
  const token = await prisma.tokenAcesso.findFirst({
    where: { usuarioId: usuario.id, tipo: "RECUPERACAO_SENHA", utilizadoEm: null, expiraEm: { gt: new Date() } },
    orderBy: { criadoEm: "desc" },
  });
  if (!token || !await bcrypt.compare(codigo, token.tokenHash)) throw invalido();
  const senhaHash = await bcrypt.hash(novaSenha, 10);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Usuario" WHERE "id" = ${usuario.id}::uuid FOR UPDATE`;
    const consumo = await tx.tokenAcesso.updateMany({
      where: { id: token.id, utilizadoEm: null, expiraEm: { gt: new Date() } },
      data: { utilizadoEm: new Date() },
    });
    if (consumo.count !== 1) throw invalido();
    await tx.usuario.update({ where: { id: usuario.id }, data: { senhaHash, deveAlterarSenha: false, tokensRevogadosAte: new Date() } });
  });
}
