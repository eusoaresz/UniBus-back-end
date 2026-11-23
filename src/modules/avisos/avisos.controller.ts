import type { Response } from "express";
import type { ReqUsuario } from "../../shared/middlewares/auth";
import * as schemas from "./avisos.schemas";
import * as service from "./avisos.service";

export async function criar(req: ReqUsuario, res: Response) {
  const dados = schemas.criarAvisoSchema.parse(req.body);
  res.status(201).json(await service.criarAviso(dados, req.usuarioId!));
}

export async function listar(req: ReqUsuario, res: Response) {
  const filtros = schemas.listarAvisosSchema.parse(req.query);
  res.json(await service.listarAvisos(filtros, req.usuarioPerfil!));
}

export async function gestao(req: ReqUsuario, res: Response) {
  res.json(await service.listarGestao(schemas.listarAvisosSchema.parse(req.query)));
}

export async function consultarGestao(req: ReqUsuario, res: Response) {
  res.json(await service.consultarGestao(schemas.avisoIdSchema.parse(req.params.id)));
}

export async function consultar(req: ReqUsuario, res: Response) {
  res.json(await service.consultarAviso(schemas.avisoIdSchema.parse(req.params.id), req.usuarioPerfil!));
}

export async function editar(req: ReqUsuario, res: Response) {
  const id = schemas.avisoIdSchema.parse(req.params.id);
  res.json(await service.editarAviso(id, schemas.editarAvisoSchema.parse(req.body), req.usuarioId!));
}

export async function alterarStatus(req: ReqUsuario, res: Response) {
  const id = schemas.avisoIdSchema.parse(req.params.id);
  res.json(await service.alterarStatus(id, schemas.alterarStatusAvisoSchema.parse(req.body), req.usuarioId!));
}
