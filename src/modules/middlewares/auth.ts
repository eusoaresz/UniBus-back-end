import type { NextFunction, Request, Response } from "express";
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../../../lib/prisma";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("A variável de ambiente JWT_SECRET não foi definida.");
}
const JWT_SECRET: string = jwtSecret;

export interface ReqUsuario extends Request {
  usuarioId?: string;
  usuarioEmail?: string;
  usuarioPerfil?: string;
}

export async function verificarToken(req: ReqUsuario, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return res.status(401).json({ erro: "Token não informado" });
  }

  let usuarioId: string;
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof payload === "string" || typeof payload.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.id) ||
        payload.tipo === "cliente") {
      return res.status(401).json({ erro: "Token inválido ou expirado" });
    }
    usuarioId = payload.id;
  } catch {
    return res.status(401).json({ erro: "Token inválido ou expirado" });
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, email: true, perfil: true, status: true },
    });
    if (!usuario) {
      return res.status(401).json({ erro: "Token inválido ou expirado" });
    }
    if (usuario.status !== "ATIVA") {
      return res.status(403).json({ erro: "Conta sem permissão para acesso" });
    }
    req.usuarioId = usuario.id;
    req.usuarioEmail = usuario.email;
    req.usuarioPerfil = usuario.perfil;
  } catch (error) {
    console.error("Erro ao verificar acesso:", error);
    return res.status(500).json({ erro: "Não foi possível verificar o acesso" });
  }
  return next();
}

export function exigirOperador(req: ReqUsuario, res: Response, next: NextFunction) {
  if (req.usuarioPerfil !== "OPERADOR") {
    return res.status(403).json({ erro: "Acesso restrito a operadores" });
  }
  return next();
}
