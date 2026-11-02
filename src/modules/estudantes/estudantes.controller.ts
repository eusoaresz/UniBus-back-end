import type { Response } from "express";
import type { ReqUsuario } from "../../shared/middlewares/auth";
import * as schemas from "./estudantes.schemas";
import * as service from "./estudantes.service";
import { HttpError } from "../../shared/errors/http-error";

export async function criar(req: ReqUsuario, res: Response) {
  res.status(201).json(await service.criarEstudante(schemas.criarEstudanteSchema.parse(req.body), req.usuarioId!));
}

export async function me(req: ReqUsuario, res: Response) {
  res.json(await service.consultarMe(req.usuarioId!));
}

export async function listar(req: ReqUsuario, res: Response) {
  res.json(await service.listarEstudantes(schemas.listarEstudantesSchema.parse(req.query)));
}

export async function consultar(req: ReqUsuario, res: Response) {
  res.json(await service.consultarEstudante(schemas.estudanteIdSchema.parse(req.params.id)));
}

export async function editar(req: ReqUsuario, res: Response) {
  const id = schemas.estudanteIdSchema.parse(req.params.id);
  res.json(await service.editarEstudante(id, schemas.editarEstudanteSchema.parse(req.body), req.usuarioId!));
}

export async function aprovar(req: ReqUsuario, res: Response) {
  const dados = schemas.aprovarEstudanteSchema.parse(req.body ?? {});
  res.json(await service.aprovarEstudante(
    schemas.estudanteIdSchema.parse(req.params.id),
    req.usuarioId!,
    dados.motivo,
  ));
}

export async function rejeitar(req: ReqUsuario, res: Response) {
  const dados = schemas.justificarEstudanteSchema.parse(req.body);
  res.json(await service.rejeitarEstudante(
    schemas.estudanteIdSchema.parse(req.params.id),
    req.usuarioId!,
    dados.motivo,
  ));
}

export async function suspender(req: ReqUsuario, res: Response) {
  const dados = schemas.justificarEstudanteSchema.parse(req.body);
  res.json(await service.suspenderEstudante(
    schemas.estudanteIdSchema.parse(req.params.id),
    req.usuarioId!,
    dados.motivo,
  ));
}

export async function reativar(req: ReqUsuario, res: Response) {
  const dados = schemas.reativarEstudanteSchema.parse(req.body ?? {});
  res.json(await service.reativarEstudante(
    schemas.estudanteIdSchema.parse(req.params.id),
    req.usuarioId!, dados.motivo,
  ));
}

export async function listarMeusComprovantes(req: ReqUsuario, res: Response) {
  res.json(await service.listarComprovantes(req.usuarioId!, schemas.listarComprovantesSchema.parse(req.query)));
}

export async function enviarComprovante(req: ReqUsuario, res: Response) {
  schemas.enviarComprovanteSchema.parse(req.body ?? {});
  if (!req.file) throw new HttpError(400, "Envie um comprovante no campo arquivo");
  res.status(201).json(await service.enviarComprovante(req.usuarioId!, {
    nomeOriginal: req.file.originalname,
    conteudo: req.file.buffer,
  }));
}
