import { z } from "zod";

export const escalaSchema = z.strictObject({
  diaSemana: z.enum(["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA"]),
  turno: z.enum(["MANHA", "TARDE", "NOITE"]),
  rotaId: z.uuid(), motoristaId: z.uuid(), veiculoId: z.uuid(),
  ativa: z.boolean().default(true),
  saidaIdaMinuto: z.number().int().min(0).max(1439).nullable().optional(),
  saidaVoltaMinuto: z.number().int().min(0).max(1439).nullable().optional(),
  chegadaPedroMinuto: z.number().int().min(0).max(1439).nullable().optional(),
  saidaVoltaDiaOffset: z.number().int().min(0).max(1).default(0),
  chegadaPedroDiaOffset: z.number().int().min(0).max(1).default(0),
});
export const editarEscalaSchema = escalaSchema.partial().extend({
  ativa: z.boolean().optional(),
  saidaVoltaDiaOffset: z.number().int().min(0).max(1).optional(),
  chegadaPedroDiaOffset: z.number().int().min(0).max(1).optional(),
}).refine(d => Object.keys(d).length > 0, "Informe um dado para alterar");
export const listarEscalasSchema = z.strictObject({
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
});
