import { z } from "zod";

export const idSchema = z.string().uuid();
export const motivoSchema = z.strictObject({ motivo: z.string().trim().min(3).max(1000) });
export const paginaSchema = z.strictObject({
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
});
export const alocacaoSchema = z.strictObject({
  motoristaId: idSchema, veiculoId: idSchema,
  motoristaExtraId: idSchema.nullable().default(null), veiculoExtraId: idSchema.nullable().default(null),
  motivo: z.string().trim().min(3).max(1000),
}).refine((d) => Boolean(d.motoristaExtraId) === Boolean(d.veiculoExtraId), "Preencha os dois recursos extras");
export const inscricaoSchema = z.strictObject({ origemId: idSchema, destinoId: idSchema });
export const inscricaoDuplaSchema = z.strictObject({ trechos: z.array(z.strictObject({
  trechoId: idSchema, origemId: idSchema, destinoId: idSchema,
})).length(2) }).refine((d) => d.trechos[0].trechoId !== d.trechos[1].trechoId, "Informe trechos distintos");
export const confirmarOperadorSchema = motivoSchema.extend({ estudanteId: idSchema });
export const reabrirSchema = motivoSchema.extend({
  saidaPrevistaEm: z.iso.datetime({ offset: true }), chegadaPrevistaEm: z.iso.datetime({ offset: true }),
  reabrir: z.boolean(),
}).refine((d) => Date.parse(d.chegadaPrevistaEm) > Date.parse(d.saidaPrevistaEm), "Chegada deve ser posterior à saída");
export const convocarSchema = z.strictObject({
  motoristaId: idSchema, veiculoId: idSchema, prazoMinutos: z.number().int().min(1).max(20).default(20),
});
export const responderVanSchema = z.strictObject({ aceitar: z.boolean() });
export const embarqueSchema = z.strictObject({ participacaoId: idSchema.optional(), qr: z.string().max(2000).optional() })
  .refine((d) => Boolean(d.participacaoId) !== Boolean(d.qr), "Informe participação ou QR Code");
export const semestreSchema = z.strictObject({ nome: z.string().trim().min(3).max(100),
  inicio: z.iso.datetime({ offset: true }), fim: z.iso.datetime({ offset: true }),
}).refine((d) => Date.parse(d.fim) > Date.parse(d.inicio), "Fim deve ser posterior ao início");
export const justificativaSchema = z.strictObject({ justificativa: z.string().trim().min(3).max(3000) });
export const analiseFaltaSchema = motivoSchema.extend({ aprovar: z.boolean() });
export const liberarDisciplinaSchema = motivoSchema.extend({ semestreId: idSchema });
