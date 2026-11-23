import { z } from "zod";
import { criarUsuarioSchema } from "../usuarios/usuarios.schemas";

const cnh = {
  numeroCnh: z.string().trim().regex(/^\d{11}$/, "Informe os 11 dígitos da CNH"),
  categoriaCnh: z.enum(["D", "E"]),
  validadeCnh: z.iso.date(),
};
const motivo = z.string().trim().min(3).max(1000);
export const criarMotoristaSchema = criarUsuarioSchema.omit({ perfil: true }).extend(cnh);
export const complementarMotoristaSchema = z.strictObject({ ...cnh, motivo });
export const editarMotoristaSchema = z.strictObject({
  numeroCnh: cnh.numeroCnh.optional(), categoriaCnh: cnh.categoriaCnh.optional(),
  validadeCnh: cnh.validadeCnh.optional(), motivo,
}).refine(dados => Object.keys(dados).some(campo => campo !== "motivo"), "Informe um dado da CNH");
export const listarMotoristasSchema = z.strictObject({
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  nome: z.string().trim().min(2).max(150).optional(),
  status: z.enum(["AGUARDANDO_ATIVACAO", "ATIVA", "BLOQUEADA", "INATIVA"]).optional(),
});
