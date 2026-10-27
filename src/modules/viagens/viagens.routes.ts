import { Router } from "express";
import { verificarToken, exigirOperador } from "../../shared/middlewares/auth";
import * as controller from "./viagens.controller";

const router = Router();
router.use(verificarToken, exigirOperador);
router.post("/", controller.criar);
router.get("/", controller.listar);
router.get("/:id", controller.consultar);
router.put("/:id", controller.editar);
export default router;
