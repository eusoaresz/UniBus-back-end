import { Router } from "express";
import { verificarToken, exigirOperador, type ReqUsuario } from "../../shared/middlewares/auth";
import { idSchema } from "../usuarios/usuarios.schemas";
import * as service from "./ensino.service";

export function ensinoRouter(tipo: service.CadastroEnsino) {
  const router = Router();
  router.use(verificarToken, exigirOperador);
  router.post("/", async (req: ReqUsuario, res) => { res.status(201).json(await service.criar(tipo, req.body, req.usuarioId!)); });
  router.get("/", async (req, res) => { res.json(await service.listar(tipo, req.query)); });
  router.get("/:id", async (req, res) => { res.json(await service.consultar(tipo, idSchema.parse(req.params.id))); });
  router.get("/:id/historico", async (req, res) => { res.json(await service.historico(tipo, idSchema.parse(req.params.id), req.query)); });
  router.patch("/:id", async (req: ReqUsuario, res) => { res.json(await service.editar(tipo, idSchema.parse(req.params.id), req.body, req.usuarioId!)); });
  router.patch("/:id/status", async (req: ReqUsuario, res) => { res.json(await service.alterarStatus(tipo, idSchema.parse(req.params.id), req.body, req.usuarioId!)); });
  return router;
}
