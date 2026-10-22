import { Router } from "express";
import { verificarToken, exigirOperador } from "../../shared/middlewares/auth";
import * as controller from "./usuarios.controller";

const router = Router();
router.use(verificarToken);
router.get("/me", controller.me);
router.patch("/me", controller.atualizarMe);
router.use(exigirOperador);
router.post("/", controller.criar);
router.get("/", controller.listar);
router.get("/:id", controller.consultar);
router.patch("/:id/status", controller.status);
export default router;
