import { z } from "zod";
import { emailSchema, senhaSchema } from "../usuarios/usuarios.schemas";

export const loginSchema = z.strictObject({ email: emailSchema, senha: z.string().min(1).max(200) });
export const recuperarSchema = z.strictObject({ email: emailSchema });
export const redefinirSchema = z.strictObject({
  email: emailSchema, codigo: z.string().regex(/^\d{6}$/), novaSenha: senhaSchema,
});
