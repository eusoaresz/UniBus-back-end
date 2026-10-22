import type { Response } from "express";
import type { ReqUsuario } from "../../shared/middlewares/auth";
import * as schemas from "./usuarios.schemas";
import * as service from "./usuarios.service";

export async function criar(req: ReqUsuario, res: Response) {
  res.status(201).json(await service.criarUsuario(schemas.criarUsuarioSchema.parse(req.body), req.usuarioId!));
}
export async function listar(req: ReqUsuario, res: Response) {
  res.json(await service.listarUsuarios(schemas.listarUsuariosSchema.parse(req.query)));
}
export async function me(req: ReqUsuario, res: Response) {
  res.json(await service.consultarUsuario(req.usuarioId!));
}
export async function atualizarMe(req: ReqUsuario, res: Response) {
  res.json(await service.atualizarMe(req.usuarioId!, schemas.atualizarMeSchema.parse(req.body)));
}
export async function consultar(req: ReqUsuario, res: Response) {
  res.json(await service.consultarUsuario(schemas.idSchema.parse(req.params.id)));
}
export async function status(req: ReqUsuario, res: Response) {
  res.json(await service.alterarStatus(schemas.idSchema.parse(req.params.id), req.usuarioId!, schemas.statusSchema.parse(req.body)));
}
