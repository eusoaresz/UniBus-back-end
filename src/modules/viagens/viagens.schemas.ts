import { z } from "zod";

const trechoRascunhoSchema = z.strictObject({
  sentido: z.enum(["IDA", "VOLTA"]),
  saidaPrevistaEm: z.iso.datetime({ offset: true }).optional(),
});

export const criarViagemRascunhoSchema = z.strictObject({
  data: z.iso.date(),
  turno: z.enum(["MANHA", "TARDE", "NOITE"]),
  rotaId: z.string().uuid(),
  trechos: z.array(trechoRascunhoSchema).min(1).max(2),
}).superRefine((dados, ctx) => {
  const sentidos = new Set<string>();
  dados.trechos.forEach((trecho, indice) => {
    if (sentidos.has(trecho.sentido)) {
      ctx.addIssue({ code: "custom", path: ["trechos", indice, "sentido"], message: "Informe cada sentido apenas uma vez" });
    }
    sentidos.add(trecho.sentido);
  });

  const ida = dados.trechos.find((trecho) => trecho.sentido === "IDA")?.saidaPrevistaEm;
  const volta = dados.trechos.find((trecho) => trecho.sentido === "VOLTA")?.saidaPrevistaEm;
  if (ida && volta && Date.parse(volta) <= Date.parse(ida)) {
    ctx.addIssue({ code: "custom", path: ["trechos"], message: "A saída da volta deve ocorrer depois da saída da ida" });
  }
});
