import { Router } from "express";
import type { Response } from "express";
import { verificarToken, exigirOperador, type ReqUsuario } from "../../shared/middlewares/auth";
import * as s from "./carteira.schemas";
import * as service from "./carteira.service";

export const carteiraRouter = Router();
export const operadorCarteiraRouter = Router();
type Handler = (req: ReqUsuario) => Promise<unknown>;
const responder = (fn: Handler, status = 200) => async (req: ReqUsuario, res: Response) => { res.status(status).json(service.serializar(await fn(req))); };
const propria = (req: ReqUsuario) => service.carteiraPropria(req.usuarioId!);

carteiraRouter.use(verificarToken, (req: ReqUsuario, res, next) => {
  if (req.usuarioPerfil !== "ESTUDANTE") { res.status(403).json({ erro: "Acesso restrito a estudantes" }); return; }
  next();
});
carteiraRouter.get("/", responder(propria));
carteiraRouter.get("/extrato", responder(async (req) => service.extrato((await propria(req)).id, s.paginaSchema.parse(req.query))));
carteiraRouter.get("/recargas", responder(async (req) => service.listarRecargas(s.recargasFiltroSchema.parse(req.query), (await propria(req)).id)));
carteiraRouter.post("/recargas", responder(async (req) => service.solicitarRecarga((await propria(req)).id, req.usuarioId!, s.recargaSchema.parse(req.body)), 201));
carteiraRouter.get("/notificacoes", responder(async (req) => { await propria(req); return service.notificacoes(req.usuarioId!, s.paginaSchema.parse(req.query)); }));

operadorCarteiraRouter.use(verificarToken, exigirOperador);
operadorCarteiraRouter.get("/carteiras", responder((req) => service.listarCarteiras(s.carteirasFiltroSchema.parse(req.query))));
operadorCarteiraRouter.get("/carteiras/:estudanteId", responder((req) => service.carteiraEstudante(s.idSchema.parse(req.params.estudanteId))));
operadorCarteiraRouter.get("/carteiras/:estudanteId/extrato", responder(async (req) => service.extrato((await service.carteiraEstudante(s.idSchema.parse(req.params.estudanteId))).id, s.paginaSchema.parse(req.query))));
operadorCarteiraRouter.get("/recargas", responder((req) => service.listarRecargas(s.recargasFiltroSchema.parse(req.query))));
operadorCarteiraRouter.post("/recargas/dinheiro", responder((req) => service.registrarDinheiro(req.usuarioId!, s.dinheiroSchema.parse(req.body)), 201));
operadorCarteiraRouter.post("/recargas/:id/aprovar", responder((req) => service.analisarRecarga(s.idSchema.parse(req.params.id), req.usuarioId!, true, s.aprovarSchema.parse(req.body))));
operadorCarteiraRouter.post("/recargas/:id/rejeitar", responder((req) => service.analisarRecarga(s.idSchema.parse(req.params.id), req.usuarioId!, false, s.rejeitarSchema.parse(req.body))));
operadorCarteiraRouter.post("/recargas/:id/estornar", responder((req) => service.estornarRecarga(s.idSchema.parse(req.params.id), req.usuarioId!, s.estornarSchema.parse(req.body))));
