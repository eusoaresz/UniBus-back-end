import { Router } from "express";
import { verificarToken, exigirOperador, type ReqUsuario } from "../../shared/middlewares/auth";
import { idSchema } from "../usuarios/usuarios.schemas";
import * as schemas from "./motoristas.schemas";
import * as service from "./motoristas.service";

const router = Router();
router.use(verificarToken, exigirOperador);
router.post("/", async (req: ReqUsuario, res) => {
  res.status(201).json(await service.criar(schemas.criarMotoristaSchema.parse(req.body), req.usuarioId!));
});
router.post("/usuarios/:usuarioId", async (req: ReqUsuario, res) => {
  res.status(201).json(await service.complementar(idSchema.parse(req.params.usuarioId), schemas.complementarMotoristaSchema.parse(req.body), req.usuarioId!));
});
router.get("/", async (req, res) => { res.json(await service.listar(schemas.listarMotoristasSchema.parse(req.query))); });
router.get("/:id", async (req, res) => { res.json(await service.consultar(idSchema.parse(req.params.id))); });
router.patch("/:id", async (req: ReqUsuario, res) => {
  res.json(await service.editar(idSchema.parse(req.params.id), schemas.editarMotoristaSchema.parse(req.body), req.usuarioId!));
});
export default router;
