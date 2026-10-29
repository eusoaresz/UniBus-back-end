import { z } from "zod";

const publicoPerfil = z.enum(["ESTUDANTE", "MOTORISTA", "OPERADOR"]).nullable();
const expiraEm = z.iso.datetime({ offset: true }).nullable()
  .refine((valor) => valor === null || Date.parse(valor) > Date.now(), "A expiração deve estar no futuro");

const camposAviso = {
  titulo: z.string().trim().min(3).max(120),
  mensagem: z.string().trim().min(1).max(5000),
  categoria: z.enum(["GERAL", "VIAGENS"]).default("GERAL"),
  importante: z.boolean().default(false),
  publicoPerfil: publicoPerfil.default(null),
  expiraEm: expiraEm.default(null),
};

export const criarAvisoSchema = z.strictObject(camposAviso);

export const editarAvisoSchema = z.strictObject({
  titulo: camposAviso.titulo.optional(),
  mensagem: camposAviso.mensagem.optional(),
  categoria: z.enum(["GERAL", "VIAGENS"]).optional(),
  importante: z.boolean().optional(),
  publicoPerfil: publicoPerfil.optional(),
  expiraEm: expiraEm.optional(),
}).refine((dados) => Object.keys(dados).length > 0, "Informe ao menos um campo para alteração");

export const alterarStatusAvisoSchema = z.strictObject({
  ativo: z.boolean(),
});

export const avisoIdSchema = z.string().uuid();

export const listarAvisosSchema = z.strictObject({
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  categoria: z.enum(["GERAL", "VIAGENS"]).optional(),
  importante: z.enum(["true", "false"]).transform((valor) => valor === "true").optional(),
});
