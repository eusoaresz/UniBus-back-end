import express from "express";
import usuariosRouter from "./modules/usuarios/usuarios.routes";
import authRouter from "./modules/auth/auth.routes";
import viagensRouter from "./modules/viagens/viagens.routes";
import avisosRouter from "./modules/avisos/avisos.routes";
import { carteiraRouter, operadorCarteiraRouter } from "./modules/carteira/carteira.routes";
import { errorHandler } from "./shared/errors/error-handler";
import estudantesRouter from "./modules/estudantes/estudantes.routes";
import operacaoRouter from "./modules/operacao/operacao.routes";

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
app.use("/api/v1/viagens", viagensRouter);
app.use("/api/v1/avisos", avisosRouter);
app.use("/api/v1/estudantes", estudantesRouter);
app.use("/api/v1/operacao", operacaoRouter);
app.use("/api/v1/carteira", carteiraRouter);
app.use("/api/v1/operador", operadorCarteiraRouter);
app.use("/usuarios", authRouter, usuariosRouter);
app.use((_req, res) => { res.status(404).json({ erro: "Rota não encontrada" }); });
app.use(errorHandler);

export default app;
