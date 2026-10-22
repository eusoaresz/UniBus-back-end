import express from "express";
import usuariosRouter from "./modules/usuarios/usuarios.routes";
import authRouter from "./modules/auth/auth.routes";
import { errorHandler } from "./shared/errors/error-handler";

const app = express();

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});
app.use(express.json({ limit: "32kb" }));
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/usuarios", usuariosRouter);
// Compatibilidade temporária para os clientes existentes.
app.use("/usuarios", authRouter, usuariosRouter);
app.use((_req, res) => { res.status(404).json({ erro: "Rota não encontrada" }); });
app.use(errorHandler);

export default app;
