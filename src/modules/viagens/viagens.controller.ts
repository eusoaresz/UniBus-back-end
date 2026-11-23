import type { Response } from "express";
import type { ReqUsuario } from "../../shared/middlewares/auth";
import * as schemas from "./viagens.schemas";
import * as service from "./viagens.service";

export async function criar(req: ReqUsuario, res: Response) {
  res.status(201).json(await service.criarRascunho(schemas.criarViagemRascunhoSchema.parse(req.body), req.usuarioId!));
}

export async function listar(req: ReqUsuario, res: Response) {
  res.json(await service.listarViagens(schemas.listarViagensSchema.parse(req.query)));
}

export async function consultar(req: ReqUsuario, res: Response) {
  res.json(await service.consultarViagem(schemas.viagemIdSchema.parse(req.params.id)));
}

export async function editar(req: ReqUsuario, res: Response) {
  res.json(await service.editarRascunho(schemas.viagemIdSchema.parse(req.params.id), schemas.editarViagemRascunhoSchema.parse(req.body), req.usuarioId!));
}
