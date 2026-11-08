import { gerarViagensDasEscalas } from "../modules/operacao/geracao.service";

const INTERVALO_MS = 6 * 60 * 60 * 1000;

// Mantém sempre os próximos dias gerados; repetir é seguro porque viagens existentes são ignoradas.
export function iniciarGeracaoViagensJob() {
  let executando = false;
  const executar = async () => {
    if (executando) return;
    executando = true;
    try {
      const { criadas, falhas } = await gerarViagensDasEscalas();
      if (criadas) console.log(`Geração automática: ${criadas} viagem(ns) criada(s) a partir das escalas`);
      for (const falha of falhas) console.error(`Geração automática não criou ${falha}`);
    } catch {
      console.error("Falha ao gerar viagens a partir das escalas");
    } finally { executando = false; }
  };
  const timer = setInterval(() => { void executar(); }, INTERVALO_MS);
  timer.unref();
  void executar();
  return () => clearInterval(timer);
}
