import { z } from "zod";

const trechoRascunhoSchema = z.strictObject({
  sentido: z.enum(["IDA", "VOLTA"]),
  saidaPrevistaEm: z.iso.datetime({ offset: true }),
  chegadaPrevistaEm: z.iso.datetime({ offset: true }),
}).superRefine((trecho, ctx) => {
  if (Date.parse(trecho.chegadaPrevistaEm) <= Date.parse(trecho.saidaPrevistaEm)) {
    ctx.addIssue({ code: "custom", path: ["chegadaPrevistaEm"], message: "A chegada estimada deve ocorrer depois da saída" });
  }
});

export const criarViagemRascunhoSchema = z.strictObject({
  data: z.iso.date(),
  turno: z.enum(["MANHA", "TARDE", "NOITE"]),
  rotaId: z.string().uuid(),
  trechos: z.array(trechoRascunhoSchema).length(2, "Informe os trechos de ida e volta"),
}).superRefine((dados, ctx) => {
  const sentidos = new Set<string>();
  dados.trechos.forEach((trecho, indice) => {
    if (sentidos.has(trecho.sentido)) {
      ctx.addIssue({ code: "custom", path: ["trechos", indice, "sentido"], message: "Informe cada sentido apenas uma vez" });
    }
    sentidos.add(trecho.sentido);
  });

  const ida = dados.trechos.find((trecho) => trecho.sentido === "IDA")?.chegadaPrevistaEm;
  const saidaIda = dados.trechos.find((trecho) => trecho.sentido === "IDA")?.saidaPrevistaEm;
  if (saidaIda && Number.isFinite(Date.parse(saidaIda))) {
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date(saidaIda));
    const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value;
    if (`${parte("year")}-${parte("month")}-${parte("day")}` !== dados.data) {
      ctx.addIssue({ code: "custom", path: ["data"], message: "A data deve corresponder à saída da ida no horário de Pedro Osório" });
    }
  }
  const volta = dados.trechos.find((trecho) => trecho.sentido === "VOLTA")?.saidaPrevistaEm;
  if (ida && volta && Date.parse(volta) < Date.parse(ida)) {
    ctx.addIssue({ code: "custom", path: ["trechos"], message: "A saída da volta não pode ocorrer antes da chegada da ida" });
  }
});

export const editarViagemRascunhoSchema = criarViagemRascunhoSchema.safeExtend({
  motivo: z.string().trim().min(3).max(500),
});

export const viagemIdSchema = z.string().uuid();

export const listarViagensSchema = z.strictObject({
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  data: z.iso.date().optional(),
  turno: z.enum(["MANHA", "TARDE", "NOITE"]).optional(),
  rotaId: z.string().uuid().optional(),
  status: z.enum(["RASCUNHO", "PROGRAMADA", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"]).optional(),
});
