import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "./http-error";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ erro: "Dados inválidos", campos: error.flatten().fieldErrors });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ erro: error.message });
    return;
  }
  const code = error && typeof error === "object" ? error.code : undefined;
  if (code === "P2002") {
    res.status(409).json({ erro: "Dados já cadastrados" });
    return;
  }
  if (code === "P2025") {
    res.status(404).json({ erro: "Usuário não encontrado" });
    return;
  }
  if (error?.type === "entity.parse.failed") {
    res.status(400).json({ erro: "JSON inválido" });
    return;
  }
  if (error?.type === "entity.too.large") {
    res.status(413).json({ erro: "Corpo da requisição excede o limite" });
    return;
  }
  console.error("Falha interna ao processar requisição");
  res.status(500).json({ erro: "Não foi possível processar a solicitação" });
};
