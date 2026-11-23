import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PrismaClient } from "../generated/prisma";
import { adapterMemoria } from "./helpers/postgres-memoria";

process.env.JWT_SECRET = "segredo-exclusivo-dos-testes-sem-uso-real";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.NODE_ENV = "test";
process.env.MAILTRAP_USER = "test"; process.env.MAILTRAP_PASS = "test"; process.env.SMTP_FROM = "test@example.com";
const db = new PGlite();
const prisma = new PrismaClient({ adapter: adapterMemoria(db) });
let server: Server;
let base: string;
let usuarioId: string;
let codigo: string;
let destinatario: string;
let restaurarMail: () => void;
let senha = "SenhaForte123!";
const email = "aluno@example.com";
async function api(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: res.status === 204 ? null : await res.json() as any };
}
async function entrar() {
  const r = await api("POST", "/auth/login", undefined, { email, senha });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.token as string;
}
before(async () => {
  for (const pasta of readdirSync("prisma/migrations").filter(p => /^\d/.test(p)).sort()) await db.exec(readFileSync(`prisma/migrations/${pasta}/migration.sql`, "utf8"));
  (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
  const u = await prisma.usuario.create({ data: { nome: "Aluno", cpf: "52998224725", email, telefone: "53999999999", senhaHash: await bcrypt.hash(senha, 4), perfil: "ESTUDANTE", status: "ATIVA", dataNascimento: new Date("2004-02-10") } });
  usuarioId = u.id;
  const ponto = await prisma.pontoParada.create({ data: { nome: "Campus", cidade: "Pelotas" } });
  const unidade = await prisma.unidadeEnsino.create({ data: { nome: "Campus", pontoParada: { connect: { id: ponto.id } }, instituicaoEnsino: { create: { nome: "Universidade", tipo: "FACULDADE" } } } });
  await prisma.estudante.create({ data: { usuarioId, unidadeEnsinoId: unidade.id, matricula: "01", curso: "Computação", previsaoConclusao: new Date("2030-12-31"), statusCadastro: "APROVADO", carteira: { create: { saldo: "15.50" } } } });
  await prisma.preferencias.create({ data: { usuarioId, turnos: ["NOITE"] } });
  const { transporter } = await import("../lib/mailer");
  const original = transporter.sendMail;
  Object.assign(transporter, { sendMail: async (args: any) => { destinatario = args.to; codigo = args.text.match(/\b\d{6}\b/)[0]; return {}; } });
  restaurarMail = () => { transporter.sendMail = original; };
  const app = (await import("../src/app")).default;
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  restaurarMail?.(); await prisma.$disconnect(); await db.close();
});

test("login usa email/senha, token expira e não contém dados pessoais", async () => {
  assert.equal((await api("POST", "/auth/login", undefined, { email, senha: "errada" })).status, 401);
  const token = await entrar();
  const payload = jwt.verify(token, process.env.JWT_SECRET!) as jwt.JwtPayload;
  assert.equal(payload.exp! - payload.iat!, 3600);
  assert.ok(payload.jti);
  for (const campo of ["cpf", "nome", "email", "senhaHash"]) assert.equal(campo in payload, false);
  assert.equal((await api("GET", "/usuarios/me", token)).status, 200);
});
test("logout revoga somente o token atual e preserva cadastro, carteira e preferências", async () => {
  const primeiro = await entrar(), segundo = await entrar();
  assert.notEqual(primeiro, segundo);
  const dados = (await api("GET", "/usuarios/me", primeiro)).body;
  const saidas = await Promise.all([api("POST", "/auth/logout", primeiro), api("POST", "/auth/logout", primeiro)]);
  assert.deepEqual(saidas.map(r => r.status), [204, 204]);
  assert.equal((await api("GET", "/usuarios/me", primeiro)).status, 401);
  assert.equal((await api("GET", "/usuarios/me", segundo)).status, 200);
  assert.equal((await api("POST", "/auth/logout", primeiro)).status, 204);
  const registro = await prisma.tokenRevogado.findUniqueOrThrow({ where: { tokenHash: createHash("sha256").update(primeiro).digest("hex") } });
  assert.equal(registro.usuarioId, usuarioId);
  assert.equal(JSON.stringify(registro).includes(primeiro), false);
  const novo = await entrar();
  assert.deepEqual((await api("GET", "/usuarios/me", novo)).body, dados);
  assert.equal((await api("GET", "/carteira", novo)).body.saldo, "15.50");
  assert.deepEqual((await api("GET", "/preferencias/me", novo)).body.turnos, ["NOITE"]);
});
test("fechar ou expirar token não remove dados e novo login recupera o perfil", async () => {
  const expirado = jwt.sign({ id: usuarioId }, process.env.JWT_SECRET!, { expiresIn: -1 });
  assert.equal((await api("GET", "/usuarios/me", expirado)).status, 401);
  assert.equal((await api("POST", "/auth/logout")).status, 401);
  const token = await entrar();
  assert.equal((await api("GET", "/usuarios/me", token)).body.estudante.curso, "Computação");
  const semExpiracao = jwt.sign({ id: usuarioId }, process.env.JWT_SECRET!);
  assert.equal((await api("GET", "/usuarios/me", semExpiracao)).status, 401);
});
test("recuperação envia código ao email, guarda hash e redefine sem manter tokens antigos", async () => {
  const anterior = await entrar();
  const r = await api("POST", "/auth/recuperar-senha", undefined, { email });
  assert.equal(r.status, 200); assert.equal(destinatario, email);
  assert.equal("codigo" in r.body, false);
  const registro = await prisma.tokenAcesso.findFirstOrThrow({ where: { usuarioId, utilizadoEm: null } });
  assert.notEqual(registro.tokenHash, codigo); assert.equal(await bcrypt.compare(codigo, registro.tokenHash), true);
  assert.equal((await api("POST", "/auth/redefinir-senha", undefined, { email, codigo: "000000", novaSenha: "NovaSenha123!" })).status, 400);
  assert.equal((await api("POST", "/auth/redefinir-senha", undefined, { email, codigo, novaSenha: "NovaSenha123!" })).status, 200);
  assert.equal((await api("GET", "/usuarios/me", anterior)).status, 401);
  assert.equal((await api("POST", "/auth/login", undefined, { email, senha })).status, 401);
  assert.equal((await api("POST", "/auth/redefinir-senha", undefined, { email, codigo, novaSenha: "OutraSenha123!" })).status, 400);
  senha = "NovaSenha123!";
  assert.equal((await api("GET", "/usuarios/me", await entrar())).body.nome, "Aluno");
});
test("email desconhecido recebe a mesma resposta sem enviar código", async () => {
  destinatario = "";
  const r = await api("POST", "/auth/recuperar-senha", undefined, { email: "inexistente@example.com" });
  assert.equal(r.status, 200); assert.equal(destinatario, "");
});
test("conta bloqueada ou encerrada consegue sair sem ganhar acesso de escrita", async () => {
  const token = await entrar();
  await prisma.usuario.update({ where: { id: usuarioId }, data: { status: "BLOQUEADA" } });
  assert.equal((await api("GET", "/usuarios/me", token)).status, 403);
  assert.equal((await api("POST", "/auth/logout", token)).status, 204);
  await prisma.usuario.update({ where: { id: usuarioId }, data: { status: "ATIVA" } });
  const outro = await entrar();
  await prisma.estudante.update({ where: { usuarioId }, data: { statusCadastro: "ENCERRADO" } });
  assert.equal((await api("PATCH", "/usuarios/me", outro, { nome: "Outro" })).status, 403);
  assert.equal((await api("POST", "/auth/logout", outro)).status, 204);
});
