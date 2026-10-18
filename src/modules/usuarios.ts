import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma";
import { transporter } from "../../lib/mailer";
import { verificarToken, ReqUsuario } from "../middlewares/auth";
import dotenv from "dotenv";

dotenv.config();

const router = Router();
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  console.error('ERRO: A variável de ambiente JWT_SECRET não foi definida.');
  console.error('A aplicação foi interrompida para garantir a segurança.');
  process.exit(1);
}

const JWT_SECRET: string = jwtSecret;
console.log('A variável de ambiente JWT_SECRET foi detectada com sucesso. Iniciando servidor...');
const SALT_ROUNDS = 10;

const senhaForteSchema = z
  .string()
  .min(8, "A senha deve ter no mínimo 8 caracteres")
  .regex(/[a-z]/, "A senha deve conter pelo menos uma letra minúscula")
  .regex(/[A-Z]/, "A senha deve conter pelo menos uma letra maiúscula")
  .regex(/[0-9]/, "A senha deve conter pelo menos um número")
  .regex(/[^a-zA-Z0-9]/, "A senha deve conter pelo menos um símbolo");

const usuarioSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  cpf: z.string().regex(/^\d{11}$/, "CPF deve conter 11 dígitos"),
  email: z.string().email("Email inválido"),
  telefone: z.string().min(1, "Telefone é obrigatório"),
  senha: senhaForteSchema,
  perfil: z.enum(["ESTUDANTE", "MOTORISTA", "OPERADOR"]),
});

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  senha: z.string(),
});

const recuperarSenhaSchema = z.object({
  email: z.string().email("Email inválido"),
});

const redefinirSenhaSchema = z.object({
  email: z.string().email("Email inválido"),
  codigo: z.string().length(6, "Código deve ter 6 caracteres"),
  novaSenha: senhaForteSchema,
});







export default router;