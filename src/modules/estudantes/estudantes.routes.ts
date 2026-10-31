import { Router } from "express";
import {verificarToken,exigirOperador,} from "../../shared/middlewares/auth";
import * as controller from "./estudantes.controller";

const router = Router();

router.use(verificarToken);
router.get("/me", controller.me);
router.get("/me/comprovantes",controller.listarMeusComprovantes,);
router.post("/me/comprovantes",controller.enviarComprovante,);
router.use(exigirOperador);
router.post("/", controller.criar);
router.get("/", controller.listar);
router.get("/:id", controller.consultar);
router.patch("/:id", controller.editar);
router.post("/:id/aprovar", controller.aprovar);
router.post("/:id/rejeitar", controller.rejeitar);
router.post("/:id/suspender", controller.suspender);
router.post("/:id/reativar", controller.reativar);

export default router;