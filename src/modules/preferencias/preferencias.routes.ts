import { Router } from "express";
import { verificarToken } from "../../shared/middlewares/auth";
import * as controller from "./preferencias.controller";

const router = Router();

router.use(verificarToken);
router.get("/opcoes", controller.opcoes);
router.get("/me", controller.consultar);
router.patch("/me", controller.atualizar);

export default router;