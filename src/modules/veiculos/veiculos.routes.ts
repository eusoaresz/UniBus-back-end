import { Router } from "express";
import { verificarToken, exigirOperador, type ReqUsuario } from "../../shared/middlewares/auth";
import { idSchema } from "../usuarios/usuarios.schemas";
import * as schemas from "./veiculos.schemas";
import * as service from "./veiculos.service";

const router = Router();
router.use(verificarToken, exigirOperador);
router.post("/", async (req: ReqUsuario, res) => {
  res.status(201).json(await service.criar(schemas.criarVeiculoSchema.parse(req.body), req.usuarioId!));
});
router.get("/", async (req, res) => { res.json(await service.listar(schemas.listarVeiculosSchema.parse(req.query))); });
router.get("/:id", async (req, res) => { res.json(await service.consultar(idSchema.parse(req.params.id))); });
router.get("/:id/historico", async (req, res) => {
  res.json(await service.historico(idSchema.parse(req.params.id), schemas.paginacaoVeiculosSchema.parse(req.query)));
});
router.patch("/:id", async (req: ReqUsuario, res) => {
  res.json(await service.editar(idSchema.parse(req.params.id), schemas.editarVeiculoSchema.parse(req.body), req.usuarioId!));
});
router.patch("/:id/status", async (req: ReqUsuario, res) => {
  res.json(await service.alterarStatus(idSchema.parse(req.params.id), schemas.statusVeiculoSchema.parse(req.body), req.usuarioId!));
});
export default router;
