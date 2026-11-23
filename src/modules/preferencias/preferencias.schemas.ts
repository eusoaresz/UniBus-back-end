import { z } from "zod";

export const preferenciasSchema = z.strictObject({
  rotaIds: z.array(z.string().uuid()).max(50).refine((valores) => new Set(valores).size === valores.length, "Não repita rotas"),
  turnos: z.array(z.enum(["MANHA", "TARDE", "NOITE"])).max(3).refine((valores) => new Set(valores).size === valores.length, "Não repita turnos"),
  cidadeIds: z.array(z.string().uuid()).max(50).refine((valores) => new Set(valores).size === valores.length, "Não repita cidades"),
});

export const atualizarPreferenciasSchema = preferenciasSchema.partial()
  .refine((dados) => Object.keys(dados).length > 0, "Informe ao menos uma preferência para alteração");