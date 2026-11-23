import { z } from "zod";

const campos = {
  identificacao: z.string().trim().min(2).max(150),
  placa: z.string().trim().toUpperCase().regex(/^[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}$/, "Placa inválida")
    .transform(placa => placa.replace("-", "")),
  tipo: z.enum(["ONIBUS", "VAN"]),
  capacidade: z.number().int().min(1).max(2147483647),
};
const motivo = z.string().trim().min(3).max(1000);
export const criarVeiculoSchema = z.strictObject(campos);
export const editarVeiculoSchema = criarVeiculoSchema.partial().extend({ motivo })
  .refine(dados => Object.keys(dados).some(campo => campo !== "motivo"), "Informe ao menos um dado do veículo");
export const statusVeiculoSchema = z.strictObject({ ativo: z.boolean(), motivo });
export const paginacaoVeiculosSchema = z.strictObject({
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
});
export const listarVeiculosSchema = paginacaoVeiculosSchema.extend({
  tipo: campos.tipo.optional(), placa: campos.placa.optional(),
  identificacao: z.string().trim().min(2).max(150).optional(),
  ativo: z.enum(["true", "false"]).transform(valor => valor === "true").optional(),
});
