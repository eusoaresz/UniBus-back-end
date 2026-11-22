import express from "express";
import usuariosRouter from "./modules/usuarios/usuarios.routes";
import authRouter from "./modules/auth/auth.routes";
import viagensRouter from "./modules/viagens/viagens.routes";
import avisosRouter from "./modules/avisos/avisos.routes";
import { carteiraRouter, operadorCarteiraRouter } from "./modules/carteira/carteira.routes";
import { errorHandler } from "./shared/errors/error-handler";
import estudantesRouter from "./modules/estudantes/estudantes.routes";
import operacaoRouter from "./modules/operacao/operacao.routes";
import preferenciasRouter from "./modules/preferencias/preferencias.routes";
import motoristasRouter from "./modules/motoristas/motoristas.routes";
import veiculosRouter from "./modules/veiculos/veiculos.routes";
import { ensinoRouter } from "./modules/ensino/ensino.routes";
import { catalogosRouter } from "./modules/catalogos/catalogos.routes";
import notificacoesRouter from "./modules/notificacoes/notificacoes.routes";
import escalasRouter from "./modules/escalas/escalas.routes";
import { receberEvento } from "./modules/carteira/pix";

const app = express();

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});
// A assinatura Stripe exige os bytes originais, antes do parser JSON.
app.post("/api/v1/pagamentos/stripe", express.raw({ type: "application/json", limit: "256kb" }), async (req, res) => {
  const assinatura = req.get("stripe-signature");
  if (!assinatura || !Buffer.isBuffer(req.body)) { res.status(400).json({ erro: "Evento de pagamento inválido" }); return; }
  res.json(await receberEvento(req.body, assinatura));
});
app.use(express.json({ limit: "32kb" }));
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/escalas", escalasRouter);
app.use("/api/v1/notificacoes", notificacoesRouter);
app.use("/api/v1/usuarios", usuariosRouter);
app.use("/api/v1/viagens", viagensRouter);
app.use("/api/v1/avisos", avisosRouter);
app.use("/api/v1/estudantes", estudantesRouter);
app.use("/api/v1/operacao", operacaoRouter);
app.use("/api/v1/preferencias", preferenciasRouter);
app.use("/api/v1/motoristas", motoristasRouter);
app.use("/api/v1/veiculos", veiculosRouter);
app.use("/api/v1/instituicoes", ensinoRouter("instituicoes"));
app.use("/api/v1/unidades-ensino", ensinoRouter("unidades"));
app.use("/api/v1/pontos-parada", ensinoRouter("pontos"));
app.use("/api/v1/rotas", catalogosRouter("rotas"));
app.use("/api/v1/cidades", catalogosRouter("cidades"));
app.use("/api/v1/carteira", carteiraRouter);
app.use("/api/v1/operador", operadorCarteiraRouter);
app.use("/usuarios", authRouter, usuariosRouter);
app.use((_req, res) => { res.status(404).json({ erro: "Rota não encontrada" }); });
app.use(errorHandler);

export default app;
