import { z } from "zod";
import { criarUsuarioSchema } from "../usuarios/usuarios.schemas";

const matricula = z.string().trim().min(1).max(50);
const unidadeEnsinoId = z.string().uuid();
const previsaoConclusao = z.iso.date();

export const criarEstudanteSchema = criarUsuarioSchema.omit({ perfil: true }).extend({
  matricula,
  previsaoConclusao,
  unidadeEnsinoId,
});

export const editarEstudanteSchema = z.strictObject({
  matricula: matricula.optional(),
  previsaoConclusao: previsaoConclusao.optional(),
  unidadeEnsinoId: unidadeEnsinoId.optional(),
}).refine((dados) => Object.keys(dados).length > 0, "Informe ao menos um campo para alteração");

export const estudanteIdSchema = z.string().uuid();

export const listarEstudantesSchema = z.strictObject({
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  statusCadastro: z.enum(["PENDENTE", "APROVADO", "REJEITADO", "SUSPENSO"]).optional(),
  unidadeEnsinoId: unidadeEnsinoId.optional(),
});

export const aprovarEstudanteSchema = z.strictObject({
  observacao: z.string().trim().min(1).max(1000).optional(),
});

export const justificarEstudanteSchema = z.strictObject({
  motivo: z.string().trim().min(3).max(1000),
});

export const comprovanteIdSchema = z.string().uuid();

export const TAMANHO_MAXIMO_COMPROVANTE = 10 * 1024 * 1024;
export const TIPOS_COMPROVANTE = ["application/pdf", "image/jpeg", "image/png"] as const;

export const enviarComprovanteSchema = z.strictObject({});

export const listarComprovantesSchema = z.strictObject({
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
});

export const reativarEstudanteSchema = z.strictObject({});

export const arquivoComprovanteSchema = z.strictObject({
  nomeOriginal: z.string().trim().min(1).max(255)
    .regex(/^[^/\\\x00-\x1f\x7f]+$/, "Nome de arquivo inválido")
    .refine((nome) => nome !== "." && nome !== "..", "Nome de arquivo inválido"),
  tipoMime: z.enum(TIPOS_COMPROVANTE),
  conteudo: z.instanceof(Buffer)
    .refine((conteudo) => conteudo.byteLength > 0, "O arquivo está vazio")
    .refine((conteudo) => conteudo.byteLength <= TAMANHO_MAXIMO_COMPROVANTE,
      "O comprovante deve ter no máximo 10 MB"),
}).transform((arquivo) => ({ ...arquivo, tamanhoBytes: arquivo.conteudo.byteLength }));
