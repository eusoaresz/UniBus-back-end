import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { createHash } from "node:crypto";
import { prisma } from "../../../lib/prisma";
import { JWT_SECRET } from "../../modules/auth/auth.config";

export interface ReqUsuario extends Request {
  usuarioId?: string;
  usuarioEmail?: string;
  usuarioPerfil?: string;
  tokenHash?: string;
  tokenExpiraEm?: Date;
}

async function autenticar(req: ReqUsuario, res: Response, next: NextFunction, logout = false) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return res.status(401).json({ erro: "Token não informado" });
  }

  let usuarioId: string;
  let emitidoEm: number;
  let expiraEm: number;
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof payload === "string" || typeof payload.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.id) ||
        payload.tipo === "cliente" || typeof payload.iat !== "number" || typeof payload.exp !== "number" ||
        !Number.isFinite(payload.exp) || !Number.isFinite(payload.iat) ||
        (payload.emitidoEm !== undefined && (typeof payload.emitidoEm !== "number" || !Number.isFinite(payload.emitidoEm)))) {
      return res.status(401).json({ erro: "Token inválido ou expirado" });
    }
    usuarioId = payload.id;
    emitidoEm = typeof payload.emitidoEm === "number" ? payload.emitidoEm : payload.iat * 1000;
    expiraEm = payload.exp * 1000;
  } catch {
    return res.status(401).json({ erro: "Token inválido ou expirado" });
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, email: true, perfil: true, status: true, tokensRevogadosAte: true, bloqueioDisciplinarAte: true, estudante: { select: { statusCadastro: true } } },
    });
    if (!usuario) {
      return res.status(401).json({ erro: "Token inválido ou expirado" });
    }
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const revogado = await prisma.tokenRevogado.findUnique({ where: { tokenHash }, select: { tokenHash: true } });
    if ((!logout && revogado) || (usuario.tokensRevogadosAte && emitidoEm <= usuario.tokensRevogadosAte.getTime())) {
      return res.status(401).json({ erro: "Token inválido ou expirado" });
    }
    if (!logout && (usuario.status !== "ATIVA" || (usuario.bloqueioDisciplinarAte && usuario.bloqueioDisciplinarAte > new Date()))) {
      return res.status(403).json({ erro: "Conta sem permissão para acesso" });
    }
    req.usuarioId = usuario.id;
    req.tokenHash = tokenHash;
    req.tokenExpiraEm = new Date(expiraEm);
    if (!logout && usuario.perfil === "ESTUDANTE" && usuario.estudante?.statusCadastro === "ENCERRADO" && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return res.status(403).json({ erro: "Cadastro encerrado permite somente consultas" });
    }
    req.usuarioEmail = usuario.email;
    req.usuarioPerfil = usuario.perfil;
  } catch (error) {
    console.error("Erro ao verificar acesso");
    return res.status(500).json({ erro: "Não foi possível verificar o acesso" });
  }
  return next();
}

export async function verificarToken(req: ReqUsuario, res: Response, next: NextFunction) {
  return autenticar(req, res, next);
}
export async function verificarTokenLogout(req: ReqUsuario, res: Response, next: NextFunction) {
  return autenticar(req, res, next, true);
}

export function exigirOperador(req: ReqUsuario, res: Response, next: NextFunction) {
  if (req.usuarioPerfil !== "OPERADOR") {
    return res.status(403).json({ erro: "Acesso restrito a operadores" });
  }
  return next();
}
