import { Router } from "express";
import { verificarToken } from "../../shared/middlewares/auth";
import * as controller from "./notificacoes.controller";
import type { ReqUsuario } from "../../shared/middlewares/auth";
import * as webPush from "./dispositivos";
import { inscricaoWebSchema } from "./envio";
import { idSchema } from "./notificacoes.schemas";

const router = Router();
router.use(verificarToken);
router.get("/push/configuracao", (_req, res) => res.json(webPush.configuracaoPublica()));
router.get("/push/inscricoes", async (req: ReqUsuario, res) => res.json(await webPush.listarNavegadores(req.usuarioId!)));
router.post("/push/inscricoes", async (req: ReqUsuario, res) => res.status(200).json(
  await webPush.registrarNavegador(req.usuarioId!, req.tokenHash!, inscricaoWebSchema.parse(req.body))));
router.delete("/push/inscricoes/:id", async (req: ReqUsuario, res) => res.json(
  await webPush.removerNavegador(req.usuarioId!, idSchema.parse(req.params.id))));
router.get("/preferencias", controller.preferencias);
router.patch("/preferencias", controller.atualizarPreferencias);
router.get("/alertas", controller.alertas);
router.get("/nao-lidas", controller.naoLidas);
router.get("/", controller.historico);
router.patch("/:id/lida", controller.ler);
export default router;
