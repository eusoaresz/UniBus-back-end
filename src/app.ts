import express from "express";
import usuariosRouter from "./modules/usuarios";

const app = express();

app.use(express.json());
app.use("/usuarios", usuariosRouter);

export default app;