import { z } from "zod";
import { Prisma } from "../../../generated/prisma";

export const idSchema = z.string().uuid();
export const chaveSchema = z.string().uuid();
export const valorSchema = z.string().regex(/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/, "Informe reais como texto, com até duas casas decimais")
  .pipe(z.string().refine((v) => new Prisma.Decimal(v).gte(2), "A recarga mínima é R$ 2,00")
    .transform((v) => new Prisma.Decimal(v).toFixed(2)));
export const recargaSchema = z.strictObject({ valor: valorSchema, chaveIdempotencia: chaveSchema });
export const dinheiroSchema = recargaSchema.extend({ estudanteId: idSchema });
export const aprovarSchema = z.strictObject({ chaveIdempotencia: chaveSchema });
export const rejeitarSchema = aprovarSchema.extend({ motivo: z.string().trim().min(1).max(500).optional() });
export const estornarSchema = aprovarSchema.extend({ motivo: z.string().trim().min(3).max(500) });
export const paginaSchema = z.strictObject({
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
});
export const recargasFiltroSchema = paginaSchema.extend({
  status: z.enum(["PENDENTE", "APROVADA", "REJEITADA", "CANCELADA"]).optional(),
  ordem: z.enum(["asc", "desc"]).default("asc"),
});
export const carteirasFiltroSchema = paginaSchema.extend({
  nome: z.string().trim().min(2).max(150).optional(),
  cpf: z.string().regex(/^\d{11}$/).optional(),
});
