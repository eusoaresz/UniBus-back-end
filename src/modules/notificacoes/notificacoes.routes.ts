import { Router } from "express";
import { verificarToken } from "../../shared/middlewares/auth";
import * as controller from "./notificacoes.controller";

const router = Router();
router.use(verificarToken);
router.get("/preferencias", controller.preferencias);
router.patch("/preferencias", controller.atualizarPreferencias);
router.get("/alertas", controller.alertas);
router.get("/nao-lidas", controller.naoLidas);
router.get("/", controller.historico);
router.patch("/:id/lida", controller.ler);
export default router;
