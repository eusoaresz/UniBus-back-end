import { processarPrazos } from "../modules/operacao/van.service";
import { processarNotificacoes } from "../modules/notificacoes/notificacoes.job";
import { processarExecucaoAutomatica } from "../modules/operacao/execucao.service";

export function iniciarOperacaoJob() {
  let executando = false;
  // Um trecho que não pode iniciar (ex.: sem semestre) seria tentado a cada 30 s; o motivo é registrado uma vez.
  const falhasRegistradas = new Set<string>();
  const executar = async () => {
    if (executando) return;
    executando = true;
    try { await processarPrazos(); }
    catch { console.error("Falha ao processar prazos operacionais"); }
    try {
      for (const { trechoId, erro } of (await processarExecucaoAutomatica()).falhas) {
        if (falhasRegistradas.has(trechoId + erro)) continue;
        falhasRegistradas.add(trechoId + erro);
        console.error(`Execução automática não avançou o trecho ${trechoId}: ${erro}`);
      }
    } catch { console.error("Falha ao iniciar ou concluir trechos automaticamente"); }
    try { await processarNotificacoes(); }
    catch { console.error("Falha ao processar notificações"); }
    finally { executando = false; }
  };
  const timer = setInterval(() => { void executar(); }, 30000);
  timer.unref();
  void executar();
  return () => clearInterval(timer);
}
