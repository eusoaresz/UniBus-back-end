import { alterarEncerramento } from "./estudantes-encerramento.service";
import { estudanteIdSchema, justificarEstudanteSchema } from "./estudantes.schemas";
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
for (const acao of ["encerrar", "reabrir"] as const) {
  router.post(`/:id/${acao}`, async (req: ReqUsuario, res) => {
    const { motivo } = justificarEstudanteSchema.parse(req.body);
    res.json(await alterarEncerramento(estudanteIdSchema.parse(req.params.id), req.usuarioId!, motivo, acao === "reabrir"));
  });
}
router.get("/", controller.listar);
router.get("/:id", controller.consultar);
router.patch("/:id", controller.editar);
router.post("/:id/aprovar", controller.aprovar);
router.post("/:id/rejeitar", controller.rejeitar);
router.post("/:id/suspender", controller.suspender);
router.post("/:id/reativar", controller.reativar);

export default router;
