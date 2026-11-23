import { Router } from "express";
import { limitarTentativas } from "../../shared/middlewares/rate-limit";
import * as controller from "./auth.controller";
import { verificarTokenLogout } from "../../shared/middlewares/auth";

const router = Router();
router.post("/login", limitarTentativas(30), controller.login);
router.post("/logout", verificarTokenLogout, controller.logout);
router.post("/recuperar-senha", limitarTentativas(5), controller.recuperar);
router.post("/redefinir-senha", limitarTentativas(10), controller.redefinir);
export default router;
