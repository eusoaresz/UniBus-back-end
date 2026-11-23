import type { Response } from "express";
import type { ReqUsuario } from "../../shared/middlewares/auth";
import * as s from "./notificacoes.schemas";
import * as service from "./notificacoes.service";

export async function preferencias(req: ReqUsuario, res: Response) { res.json(await service.consultarPreferencias(req.usuarioId!)); }
export async function atualizarPreferencias(req: ReqUsuario, res: Response) { res.json(await service.atualizarPreferencias(req.usuarioId!, s.preferenciasSchema.parse(req.body))); }
export async function historico(req: ReqUsuario, res: Response) { res.json(await service.listar(req.usuarioId!, s.listaSchema.parse(req.query))); }
export async function alertas(req: ReqUsuario, res: Response) { res.json(await service.listar(req.usuarioId!, s.listaSchema.parse(req.query), true)); }
export async function naoLidas(req: ReqUsuario, res: Response) { res.json(await service.naoLidas(req.usuarioId!)); }
export async function ler(req: ReqUsuario, res: Response) { res.json(await service.marcarLida(req.usuarioId!, s.idSchema.parse(req.params.id))); }
