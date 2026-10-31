import type { Response } from "express";
import type { ReqUsuario } from "../../shared/middlewares/auth";
import * as schemas from "./usuarios.schemas";
import * as service from "./usuarios.service";
import { atualizarDadosUsuario } from "./usuarios-dados.service";
import * as fotos from "./usuarios-foto.service";
import { HttpError } from "../../shared/errors/http-error";

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
  res.json(await atualizarDadosUsuario(req.usuarioId!, req.usuarioId!, schemas.atualizarMeSchema.parse(req.body)));
}
export async function atualizarDados(req: ReqUsuario, res: Response) {
  res.json(await atualizarDadosUsuario(schemas.idSchema.parse(req.params.id), req.usuarioId!, schemas.atualizarDadosSchema.parse(req.body)));
}
export async function consultarFoto(req: ReqUsuario, res: Response) {
  const id = req.params.id === undefined ? req.usuarioId! : schemas.idSchema.parse(req.params.id);
  const conteudo = await fotos.consultarFoto(id, req.usuarioId!, req.usuarioPerfil!);
  res.type("image/jpeg").set("Cache-Control", "private, no-store").send(conteudo);
}
export async function alterarFoto(req: ReqUsuario, res: Response) {
  const id = schemas.idSchema.parse(req.params.id);
  const { motivo } = schemas.motivoPerfilSchema.parse(req.body);
  if (!req.file) throw new HttpError(400, "Envie a foto");
  res.json(await fotos.alterarFoto(id, req.usuarioId!, motivo, req.file.buffer));
}
export async function removerFoto(req: ReqUsuario, res: Response) {
  const { motivo } = schemas.motivoPerfilSchema.parse(req.body);
  res.json(await fotos.alterarFoto(schemas.idSchema.parse(req.params.id), req.usuarioId!, motivo, null));
}
export async function consultar(req: ReqUsuario, res: Response) {
  res.json(await service.consultarUsuario(schemas.idSchema.parse(req.params.id)));
}
export async function status(req: ReqUsuario, res: Response) {
  res.json(await service.alterarStatus(schemas.idSchema.parse(req.params.id), req.usuarioId!, schemas.statusSchema.parse(req.body)));
}
