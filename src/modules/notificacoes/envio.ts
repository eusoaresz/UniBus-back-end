import * as webpush from "web-push";
import { z } from "zod";
import { ECDH } from "node:crypto";

// Endpoints fornecidos pelo navegador: nunca aceitar destinos arbitrários da rede.
export function endpointPermitido(valor: string) {
  try {
    const u = new URL(valor);
    return u.protocol === "https:" && !u.username && !u.password && !u.port && !u.hash &&
      (u.hostname === "fcm.googleapis.com" || u.hostname === "updates.push.services.mozilla.com" ||
        u.hostname === "web.push.apple.com" || u.hostname.endsWith(".push.apple.com"));
  } catch { return false; }
}
const base64 = (bytes: number) => z.string().regex(/^[A-Za-z0-9_-]+$/).refine(v =>
  Buffer.from(v, "base64url").length === bytes && Buffer.from(v, "base64url").toString("base64url") === v, "Chave inválida");
export const inscricaoWebSchema = z.strictObject({
  endpoint: z.string().max(2048).refine(endpointPermitido, "Provedor Web Push não permitido"),
  expirationTime: z.number().int().min(0).max(8640000000000000).nullable().optional(),
  keys: z.strictObject({ p256dh: base64(65).refine(v => {
    try { ECDH.convertKey(Buffer.from(v, "base64url"), "prime256v1"); return true; } catch { return false; }
  }, "Chave pública inválida"), auth: base64(16) }),
});

export function configuracaoWebPush() {
  if (process.env.WEB_PUSH_ENABLED !== "true") return null;
  const subject = process.env.WEB_PUSH_SUBJECT;
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) throw new Error("Configuração Web Push incompleta");
  // A biblioteca valida formato e chaves sem enviar nenhuma requisição.
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { subject, publicKey, privateKey };
}

export async function enviarWebPush(inscricao: webpush.PushSubscription, payload: string) {
  const vapidDetails = configuracaoWebPush();
  if (!vapidDetails || !endpointPermitido(inscricao.endpoint)) throw new Error("Envio Web Push indisponível");
  await webpush.sendNotification(inscricao, payload, { vapidDetails, TTL: 300, timeout: 10000, urgency: "normal" });
}
