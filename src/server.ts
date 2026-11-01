import app from "./app";
import { iniciarOperacaoJob } from "./jobs/operacao.job";

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Servidor executando em http://localhost:${PORT}`);
});
iniciarOperacaoJob();
