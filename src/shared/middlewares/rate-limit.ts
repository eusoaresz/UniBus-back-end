import type { RequestHandler } from "express";
import { createHash } from "node:crypto";

export function limitarTentativas(maximo: number, janelaMs = 15 * 60 * 1000): RequestHandler {
  const registros = new Map<string, { quantidade: number; expira: number }>();
  return (req, res, next) => {
    const agora = Date.now();
    for (const [chave, valor] of registros) if (valor.expira <= agora) registros.delete(chave);
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const chaves = [`ip:${req.ip ?? "desconhecido"}`];
    // Uploads não têm e-mail no body: não criar uma chave vazia compartilhada por todos.
    if (email) chaves.push(`email:${createHash("sha256").update(email).digest("hex")}`);
    for (const chave of chaves) {
      const registro = registros.get(chave);
      if (registro && registro.quantidade >= maximo) {
        res.setHeader("Retry-After", Math.ceil((registro.expira - agora) / 1000));
        res.status(429).json({ erro: "Muitas tentativas. Tente novamente mais tarde." });
        return;
      }
    }
    if (registros.size + chaves.filter((chave) => !registros.has(chave)).length > 10000) {
      res.status(429).json({ erro: "Muitas tentativas. Tente novamente mais tarde." });
      return;
    }
    for (const chave of chaves) {
      const registro = registros.get(chave) ?? { quantidade: 0, expira: agora + janelaMs };
      registro.quantidade++;
      registros.set(chave, registro);
    }
    next();
  };
}
