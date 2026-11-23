import type { Response } from "express";
import type { ReqUsuario } from "../../shared/middlewares/auth";
import * as schemas from "./preferencias.schemas";
import * as service from "./preferencias.service";

export async function consultar(req: ReqUsuario, res: Response) {
  res.json(await service.consultar(req.usuarioId!));
}

export async function opcoes(_req: ReqUsuario, res: Response) {
  res.json(await service.opcoes());
}

export async function atualizar(req: ReqUsuario, res: Response) {
  res.json(await service.atualizar(req.usuarioId!, schemas.atualizarPreferenciasSchema.parse(req.body)));
}