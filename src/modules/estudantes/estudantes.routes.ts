import { Router, type RequestHandler } from "express";
import { verificarToken, exigirOperador, type ReqUsuario } from "../../shared/middlewares/auth";
import * as controller from "./estudantes.controller";
import { receberComprovante } from "./estudantes.upload";
import { limitarTentativas } from "../../shared/middlewares/rate-limit";

const router = Router();

router.use(verificarToken);
const exigirEstudante: RequestHandler = (req, res, next) => {
  if ((req as ReqUsuario).usuarioPerfil !== "ESTUDANTE") {
    res.status(403).json({ erro: "Acesso restrito a estudantes" });
    return;
  }
  next();
};
router.get("/me", exigirEstudante, controller.me);
router.get("/me/comprovantes", exigirEstudante, controller.listarMeusComprovantes);
router.post("/me/comprovantes", exigirEstudante, limitarTentativas(10), receberComprovante, controller.enviarComprovante);
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
