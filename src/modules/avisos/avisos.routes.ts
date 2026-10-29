import { Router } from "express";
import { verificarToken, exigirOperador } from "../../shared/middlewares/auth";
import * as controller from "./avisos.controller";

const router = Router();

router.use(verificarToken);
router.get("/", controller.listar);
router.get("/gestao", exigirOperador, controller.gestao);
router.get("/gestao/:id", exigirOperador, controller.consultarGestao);
router.get("/:id", controller.consultar);

router.use(exigirOperador);
router.post("/", controller.criar);
router.patch("/:id", controller.editar);
router.patch("/:id/status", controller.alterarStatus);

export default router;
