import { z } from "zod";
export { listarEnsinoSchema as listarCatalogosSchema, paginacaoEnsinoSchema as paginacaoCatalogosSchema, statusEnsinoSchema as statusCatalogoSchema } from "../ensino/ensino.schemas";
const nome = z.string().trim().min(2).max(150);
const motivo = z.string().trim().min(3).max(1000);
export const cidadeSchema = z.strictObject({ nome });
export const editarCidadeSchema = cidadeSchema.extend({ motivo });
export const rotaSchema = z.strictObject({ nome, descricao: z.string().trim().min(2).max(1000).nullable().optional(),
  pontoIds: z.array(z.uuid()).min(3).max(100).refine(ids => new Set(ids).size === ids.length, "Não repita pontos na rota") });
export const editarRotaSchema = rotaSchema.partial().extend({ motivo })
  .refine(dados => Object.keys(dados).some(campo => campo !== "motivo"), "Informe um dado para alterar");
