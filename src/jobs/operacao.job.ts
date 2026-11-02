import { processarPrazos } from "../modules/operacao/van.service";
import { processarNotificacoes } from "../modules/notificacoes/notificacoes.job";

export function iniciarOperacaoJob() {
  let executando = false;
  const executar = async () => {
    if (executando) return;
    executando = true;
    try { await processarPrazos(); }
    catch { console.error("Falha ao processar prazos operacionais"); }
    try { await processarNotificacoes(); }
    catch { console.error("Falha ao processar notificações"); }
    finally { executando = false; }
  };
  const timer = setInterval(() => { void executar(); }, 30000);
  timer.unref();
  void executar();
  return () => clearInterval(timer);
}
