import type { Request, Response } from "express";
import * as schemas from "./auth.schemas";
import * as service from "./auth.service";

export async function login(req: Request, res: Response) {
  res.json(await service.login(schemas.loginSchema.parse(req.body)));
}
export async function recuperar(req: Request, res: Response) {
  const { email } = schemas.recuperarSchema.parse(req.body);
  await service.recuperarSenha(email);
  res.json({ mensagem: service.mensagemRecuperacao });
}
export async function redefinir(req: Request, res: Response) {
  await service.redefinirSenha(schemas.redefinirSchema.parse(req.body));
  res.json({ mensagem: "Senha redefinida com sucesso" });
}
