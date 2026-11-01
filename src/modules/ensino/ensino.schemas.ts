import { z } from "zod";

const nome = z.string().trim().min(2).max(150);
const endereco = z.string().trim().min(2).max(300).nullable().optional();
const motivo = z.string().trim().min(3).max(1000);
export const instituicaoSchema = z.strictObject({ nome, tipo: z.enum(["FACULDADE", "TECNICA", "PREPARATORIA"]) });
export const unidadeSchema = z.strictObject({ nome, endereco, instituicaoEnsinoId: z.uuid(), pontoParadaId: z.uuid() });
export const pontoSchema = z.strictObject({ nome, cidade: nome, endereco,
  referencia: z.string().trim().min(2).max(300).nullable().optional() });
const temAlteracao = (dados: object) => Object.keys(dados).some(campo => campo !== "motivo");
export const editarInstituicaoSchema = instituicaoSchema.partial().extend({ motivo }).refine(temAlteracao, "Informe um dado para alterar");
export const editarUnidadeSchema = unidadeSchema.omit({ instituicaoEnsinoId: true }).partial().extend({ motivo }).refine(temAlteracao, "Informe um dado para alterar");
export const editarPontoSchema = pontoSchema.partial().extend({ motivo }).refine(temAlteracao, "Informe um dado para alterar");
export const statusEnsinoSchema = z.strictObject({ ativo: z.boolean(), motivo });
export const paginacaoEnsinoSchema = z.strictObject({
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
});
export const listarEnsinoSchema = paginacaoEnsinoSchema.extend({ nome: nome.optional(),
  ativo: z.enum(["true", "false"]).transform(valor => valor === "true").optional() });
