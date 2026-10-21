import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { randomInt } from "crypto";
import { prisma } from "../../lib/prisma";
import { mailFrom, transporter } from "../../lib/mailer";
import { verificarToken, exigirOperador, type ReqUsuario } from "./middlewares/auth";

dotenv.config();

const router = Router();
const jwtSecret = process.env.JWT_SECRET;
const SALT_ROUNDS = 10;
const RECUPERACAO_EXPIRA_EM_MS = 15 * 60 * 1000;

if (!jwtSecret) {
  throw new Error("A variável de ambiente JWT_SECRET não foi definida.");
}
const JWT_SECRET: string = jwtSecret;

const senhaForteSchema = z
  .string()
  .min(8, "A senha deve ter no mínimo 8 caracteres")
  .regex(/[a-z]/, "A senha deve conter pelo menos uma letra minúscula")
  .regex(/[A-Z]/, "A senha deve conter pelo menos uma letra maiúscula")
  .regex(/[0-9]/, "A senha deve conter pelo menos um número")
  .regex(/[^a-zA-Z0-9]/, "A senha deve conter pelo menos um símbolo");

const usuarioSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório"),
  cpf: z.string().regex(/^\d{11}$/, "CPF deve conter 11 dígitos"),
  email: z.string().email("Email inválido").transform((email) => email.toLowerCase()),
  telefone: z.string().trim().min(1, "Telefone é obrigatório"),
  senha: senhaForteSchema,
  perfil: z.enum(["ESTUDANTE", "MOTORISTA", "OPERADOR"]),
});

const loginSchema = z.object({
  email: z.string().email("Email inválido").transform((email) => email.toLowerCase()),
  senha: z.string().min(1, "Senha é obrigatória"),
});

const recuperarSenhaSchema = z.object({
  email: z.string().email("Email inválido").transform((email) => email.toLowerCase()),
});

const redefinirSenhaSchema = z.object({
  email: z.string().email("Email inválido").transform((email) => email.toLowerCase()),
  codigo: z.string().regex(/^\d{6}$/, "Código deve ter 6 dígitos"),
  novaSenha: senhaForteSchema,
});

function gerarCodigoRecuperacao(): string {
  return randomInt(100000, 1000000).toString();
}

router.post("/", verificarToken, exigirOperador, async (req: ReqUsuario, res) => {
  const validacao = usuarioSchema.safeParse(req.body);
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.flatten().fieldErrors });
  }

  const { nome, cpf, email, telefone, senha, perfil } = validacao.data;

  try {
    const existente = await prisma.usuario.findFirst({
      where: { OR: [{ email }, { cpf }] },
      select: { email: true, cpf: true },
    });

    if (existente) {
      const campo = existente.email === email ? "Email" : "CPF";
      return res.status(409).json({ erro: `${campo} já cadastrado` });
    }

    const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);
    const novoUsuario = await prisma.usuario.create({
      data: { nome, cpf, email, telefone, senhaHash, perfil, cadastradoPorId: req.usuarioId },
      select: { id: true, nome: true, cpf: true, email: true, telefone: true, perfil: true, status: true },
    });

    return res.status(201).json(novoUsuario);
  } catch (error) {
    console.error("Erro ao criar usuário:", error);
    return res.status(500).json({ erro: "Erro ao criar usuário" });
  }
});

router.get("/", verificarToken, exigirOperador, async (_req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: {
        id: true,
        nome: true,
        cpf: true,
        email: true,
        telefone: true,
        perfil: true,
        status: true,
        criadoEm: true,
      },
    });

    return res.status(200).json(usuarios);
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    return res.status(500).json({ erro: "Erro ao buscar usuários" });
  }
});

router.post("/login", async (req, res) => {
  const validacao = loginSchema.safeParse(req.body);
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.flatten().fieldErrors });
  }

  const { email, senha } = validacao.data;

  try {
    const usuario = await prisma.usuario.findUnique({ where: { email } });
    const senhaValida = usuario?.senhaHash
      ? await bcrypt.compare(senha, usuario.senhaHash)
      : false;

    if (!usuario || !senhaValida) {
      return res.status(401).json({ erro: "Email ou senha inválidos" });
    }

    if (usuario.status !== "ATIVA") {
      return res.status(403).json({ erro: "Conta sem permissão para acesso" });
    }

    const token = jwt.sign(
      { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil },
      JWT_SECRET,
      { expiresIn: "1h" },
    );

    return res.status(200).json({ token });
  } catch (error) {
    console.error("Erro ao fazer login:", error);
    return res.status(500).json({ erro: "Erro ao fazer login" });
  }
});

router.post("/recuperar-senha", async (req, res) => {
  const validacao = recuperarSenhaSchema.safeParse(req.body);
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.flatten().fieldErrors });
  }

  const mensagem = "Se o e-mail estiver cadastrado, você receberá o código de recuperação.";
  const { email } = validacao.data;

  try {
    const usuario = await prisma.usuario.findUnique({ where: { email } });
    if (!usuario) {
      return res.status(200).json({ mensagem });
    }

    const codigo = gerarCodigoRecuperacao();
    const tokenHash = await bcrypt.hash(codigo, SALT_ROUNDS);
    const expiraEm = new Date(Date.now() + RECUPERACAO_EXPIRA_EM_MS);

    await prisma.tokenAcesso.updateMany({
      where: { usuarioId: usuario.id, tipo: "RECUPERACAO_SENHA", utilizadoEm: null },
      data: { utilizadoEm: new Date() },
    });
    await prisma.tokenAcesso.create({
      data: { usuarioId: usuario.id, tipo: "RECUPERACAO_SENHA", tokenHash, expiraEm },
    });

    await transporter.sendMail({
      from: mailFrom,
      to: email,
      subject: "Código de Recuperação de Senha",
      text: `Seu código de recuperação é: ${codigo}. Ele expira em 15 minutos.`,
    });

    return res.status(200).json({ mensagem });
  } catch (error) {
    console.error("Erro ao solicitar recuperação de senha:", error);
    return res.status(500).json({ erro: "Não foi possível solicitar a recuperação de senha" });
  }
});

router.post("/redefinir-senha", async (req, res) => {
  const validacao = redefinirSenhaSchema.safeParse(req.body);
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.flatten().fieldErrors });
  }

  const { email, codigo, novaSenha } = validacao.data;

  try {
    const usuario = await prisma.usuario.findUnique({ where: { email } });
    if (!usuario) {
      return res.status(400).json({ erro: "Código inválido ou expirado" });
    }

    const token = await prisma.tokenAcesso.findFirst({
      where: {
        usuarioId: usuario.id,
        tipo: "RECUPERACAO_SENHA",
        utilizadoEm: null,
        expiraEm: { gt: new Date() },
      },
      orderBy: { criadoEm: "desc" },
    });

    if (!token || !(await bcrypt.compare(codigo, token.tokenHash))) {
      return res.status(400).json({ erro: "Código inválido ou expirado" });
    }

    const senhaHash = await bcrypt.hash(novaSenha, SALT_ROUNDS);
    await prisma.$transaction([
      prisma.usuario.update({
        where: { id: usuario.id },
        data: { senhaHash, deveAlterarSenha: false },
      }),
      prisma.tokenAcesso.update({
        where: { id: token.id },
        data: { utilizadoEm: new Date() },
      }),
    ]);

    return res.status(200).json({ mensagem: "Senha redefinida com sucesso" });
  } catch (error) {
    console.error("Erro ao redefinir senha:", error);
    return res.status(500).json({ erro: "Não foi possível redefinir a senha" });
  }
});

export default router;
