import { NextFunction, Request, Response } from "express";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error("A variável de ambiente JWT_SECRET não foi definida.");
}

const JWT_SECRET: string = jwtSecret;

interface TokenPayload {
  id: string;
  email: string;
  nome?: string;
  perfil?: string;
  tipo?: "admin" | "cliente";
}

export interface ReqUsuario extends Request {
  usuarioId?: string;
  usuarioEmail?: string;
}

export interface ReqCliente extends Request {
  clienteId?: string;
  clienteEmail?: string;
}

export async function verificarToken(
  req: ReqUsuario,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ erro: "Token não informado" });
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (!token) {
    return res.status(401).json({ erro: "Token não informado" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;

    if (!payload.id || !payload.email || payload.tipo === "cliente") {
      throw new Error("Token inválido para usuário");
    }

    req.usuarioId = payload.id;
    req.usuarioEmail = payload.email;
    return next();
  } catch (error) {
    await registrarAcessoNegado(token, req);
    return res.status(401).json({ erro: "Token inválido ou expirado" });
  }
}

export function verificarCliente(
  req: ReqCliente,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ erro: "Faça login para continuar." });
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (!token) {
    return res.status(401).json({ erro: "Faça login para continuar." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;

    if (!payload.id || !payload.email || payload.tipo !== "cliente") {
      throw new Error("Token inválido para cliente");
    }

    req.clienteId = payload.id;
    req.clienteEmail = payload.email;
    return next();
  } catch {
    return res
      .status(401)
      .json({ erro: "Sua sessão expirou. Faça login novamente." });
  }
}

async function registrarAcessoNegado(token: string, req: Request) {
  const decoded = jwt.decode(token) as { id?: string } | null;

  if (!decoded?.id) {
    return;
  }

  console.warn("Acesso negado para usuário:", {
    usuarioId: decoded.id,
    ip: req.ip,
  });
}
