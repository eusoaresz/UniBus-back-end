import { Router } from "express";
import { verificarToken, exigirOperador } from "../../shared/middlewares/auth";
import * as controller from "./avisos.controller";

const router = Router();

router.use(verificarToken);
router.get("/", controller.listar);
router.get("/:id", controller.consultar);

router.use(exigirOperador);
router.post("/", controller.criar);
router.put("/:id", controller.editar);
router.patch("/:id/status", controller.alterarStatus);

export default router;