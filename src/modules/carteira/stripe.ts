import Stripe from "stripe";
import { HttpError } from "../../shared/errors/http-error";

export function ambienteStripe() {
  const ambiente = process.env.STRIPE_AMBIENTE ?? "teste";
  if (!["teste", "producao"].includes(ambiente)) throw new HttpError(503, "Ambiente de pagamento inválido");
  return ambiente;
}
function cliente() {
  const chave = process.env.STRIPE_SECRET_KEY;
  const prefixo = ambienteStripe() === "teste" ? "sk_test_" : "sk_live_";
  if (!chave?.startsWith(prefixo)) throw new HttpError(503, "Configure as credenciais do ambiente de pagamento");
  return new Stripe(chave, { timeout: 10000, maxNetworkRetries: 1 });
}
export function pagamentosHabilitados() {
  return process.env.PAGAMENTOS_ATIVOS === "true";
}
export const stripe = {
  async criar(valorCentavos: number, recargaId: string, chaveCriacao: string) {
    return cliente().paymentIntents.create({ amount: valorCentavos, currency: "brl", allowed_payment_method_types: ["pix"],
      metadata: { recargaId, chaveCriacao }, payment_method_options: { pix: { expires_after_seconds: 1800 } },
      description: "Recarga de transporte UniBus" }, { idempotencyKey: `unibus:${chaveCriacao}` });
  },
  async consultar(referencia: string) {
    return cliente().paymentIntents.retrieve(referencia, { expand: ["latest_charge"] });
  },
  verificarEvento(corpo: Buffer, assinatura: string) {
    const segredo = process.env.STRIPE_WEBHOOK_SECRET;
    if (!segredo) throw new HttpError(503, "Webhook de pagamentos não configurado");
    let evento: Stripe.Event;
    try { evento = cliente().webhooks.constructEvent(corpo, assinatura, segredo); }
    catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(400, "Assinatura do pagamento inválida");
    }
    if (evento.livemode !== (ambienteStripe() === "producao") || evento.account) throw new HttpError(400, "Evento de outra conta ou ambiente");
    return evento;
  },
};
