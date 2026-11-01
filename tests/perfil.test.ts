import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import sharp from "sharp";
import { PGlite } from "@electric-sql/pglite";
import { PrismaClient } from "../generated/prisma";
import { adapterMemoria } from "./helpers/postgres-memoria";

process.env.JWT_SECRET = "segredo-exclusivo-dos-testes-sem-uso-real";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.NODE_ENV = "test";
process.env.MAILTRAP_USER = "test"; process.env.MAILTRAP_PASS = "test"; process.env.SMTP_FROM = "test@example.com";
const diretorio = mkdtempSync(join(tmpdir(), "unibus-fotos-teste-"));
process.env.FOTOS_DIR = diretorio;
const db = new PGlite();
const prisma = new PrismaClient({ adapter: adapterMemoria(db) });
let server: Server;
let base: string;
let op: string;
let aluno: string;
let cidade: string;
let unidade: string;
let estudante: string;
const auth = (id: string) => ({ Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET!)}` });
async function api(method: string, path: string, id = op, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { ...auth(id), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() as any };
}
before(async () => {
  for (const pasta of readdirSync("prisma/migrations").filter(p => /^\d/.test(p)).sort()) await db.exec(readFileSync(`prisma/migrations/${pasta}/migration.sql`, "utf8"));
  (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
  op = (await prisma.usuario.create({ data: { nome: "Operador", cpf: "99999999999", email: "op@example.com", telefone: "53999999999", perfil: "OPERADOR", status: "ATIVA" } })).id;
  cidade = (await prisma.cidade.create({ data: { nome: "Pelotas" } })).id;
  const ponto = await prisma.pontoParada.create({ data: { nome: "Campus", cidade: "Pelotas" } });
  unidade = (await prisma.unidadeEnsino.create({ data: { nome: "Campus", pontoParada: { connect: { id: ponto.id } }, instituicaoEnsino: { create: { nome: "Universidade", tipo: "FACULDADE" } } } })).id;
  const e = await prisma.estudante.create({ data: { matricula: "001", unidadeEnsino: { connect: { id: unidade } }, previsaoConclusao: new Date("2030-12-31"), statusCadastro: "APROVADO", carteira: { create: {} }, usuario: { create: { nome: "Aluno", cpf: "88888888888", email: "aluno@example.com", telefone: "53999999999", perfil: "ESTUDANTE", status: "ATIVA", senhaHash: "privada" } } } });
  estudante = e.id; aluno = e.usuarioId;
  const app = (await import("../src/app")).default;
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.$disconnect(); await db.close();
  for (const nome of readdirSync(diretorio)) unlinkSync(join(diretorio, nome));
  rmdirSync(diretorio);
});
test("somente operador altera dados pessoais, com auditoria e sem alterar carteira ou aprovação", async () => {
  for (const path of [`/usuarios/${aluno}/dados`]) assert.equal((await api("PATCH", path, aluno, { nome: "Outro", motivo: "Correção" })).status, 403);
  const res = await api("PATCH", `/usuarios/${aluno}/dados`, op, { nome: "Aluno corrigido", dataNascimento: "2004-03-20", estudante: { curso: "Computação", cidadeOrigemId: cidade, unidadeEnsinoId: unidade }, motivo: "Correção cadastral solicitada" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.dataNascimento, "2004-03-20");
  assert.equal(res.body.estudante.curso, "Computação");
  const me = await api("GET", "/usuarios/me", aluno);
  for (const campo of ["cpf", "senhaHash", "fotoChave"]) assert.equal(campo in me.body, false);
  assert.equal(me.body.estudante.cidadeOrigem.id, cidade);
  const academico = await prisma.estudante.findUniqueOrThrow({ where: { id: estudante }, include: { carteira: true } });
  assert.equal(academico.statusCadastro, "APROVADO"); assert.equal(academico.carteira!.saldo.toFixed(2), "0.00");
  const registro = await prisma.alteracaoPerfil.findFirstOrThrow({ where: { usuarioId: aluno } });
  assert.equal(registro.realizadaPorId, op);
  assert.equal(JSON.stringify(registro).includes("senhaHash"), false);
  assert.equal(JSON.stringify(registro).includes('"cpf"'), false);
});
test("validação rejeita campos protegidos, nascimento futuro e cidade inativa", async () => {
  for (const body of [{ cpf: "12345678901", motivo: "Correção" }, { status: "INATIVA", motivo: "Correção" }, { nome: "Outro" }, { dataNascimento: "2999-01-01", motivo: "Correção" }]) {
    assert.equal((await api("PATCH", `/usuarios/${aluno}/dados`, op, body)).status, 400);
  }
  await prisma.cidade.update({ where: { id: cidade }, data: { ativa: false } });
  assert.equal((await api("PATCH", `/usuarios/${aluno}/dados`, op, { nome: "Não salvar", estudante: { cidadeOrigemId: cidade }, motivo: "Correção" })).status, 400);
  assert.equal((await prisma.usuario.findUniqueOrThrow({ where: { id: aluno } })).nome, "Aluno corrigido");
});
test("conflito de email desfaz também a alteração acadêmica e não gera auditoria", async () => {
  const quantidade = await prisma.alteracaoPerfil.count();
  assert.equal((await api("PATCH", `/usuarios/${aluno}/dados`, op, { email: "op@example.com", estudante: { curso: "Não salvar" }, motivo: "Correção" })).status, 409);
  assert.equal((await prisma.estudante.findUniqueOrThrow({ where: { id: estudante } })).curso, "Computação");
  assert.equal(await prisma.alteracaoPerfil.count(), quantidade);
});
test("alterar email remove verificação e invalida tokens pendentes", async () => {
  await prisma.usuario.update({ where: { id: aluno }, data: { emailVerificadoEm: new Date() } });
  await prisma.tokenAcesso.create({ data: { usuarioId: aluno, tipo: "RECUPERACAO_SENHA", tokenHash: "hash-teste-perfil", expiraEm: new Date(Date.now() + 60000) } });
  const res = await api("PATCH", `/usuarios/${aluno}/dados`, op, { email: "NOVO@example.com", motivo: "Correção do endereço" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.email, "novo@example.com");
  assert.equal((await prisma.usuario.findUniqueOrThrow({ where: { id: aluno } })).emailVerificadoEm, null);
  assert.notEqual((await prisma.tokenAcesso.findUniqueOrThrow({ where: { tokenHash: "hash-teste-perfil" } })).utilizadoEm, null);
});
test("cadastro unificado aceita nascimento, curso e cidade e mantém carteira", async () => {
  await prisma.cidade.update({ where: { id: cidade }, data: { ativa: true } });
  const res = await api("POST", "/estudantes", op, { nome: "Nova estudante", cpf: "52998224725", email: "nova@example.com", telefone: "53999999999", senha: "SenhaForte123!", matricula: "002", previsaoConclusao: "2030-12-31", unidadeEnsinoId: unidade, curso: "Direito", cidadeOrigemId: cidade, dataNascimento: "2005-02-10" });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.curso, "Direito");
  assert.equal(res.body.usuario.dataNascimento, "2005-02-10");
  assert.equal(res.body.cidadeOrigem.id, cidade);
  assert.equal(res.body.carteira.saldo, "0.00");
});
async function upload(id: string, buffer: Buffer, alvo = aluno) {
  const form = new FormData(); form.set("motivo", "Atualização da foto");
  form.set("foto", new Blob([new Uint8Array(buffer)], { type: "image/png" }), "foto.png");
  return fetch(`${base}/usuarios/${alvo}/foto`, { method: "PUT", headers: auth(id), body: form });
}
test("foto privada: operador envia, aluno consulta, metadados removidos e exclusão auditada", async () => {
  const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: "red" } }).withMetadata().png().toBuffer();
  assert.equal((await upload(aluno, png)).status, 403);
  const envio = await upload(op, png);
  assert.equal(envio.status, 200, await envio.text());
  const imagem = await fetch(`${base}/usuarios/me/foto`, { headers: auth(aluno) });
  assert.equal(imagem.status, 200);
  assert.equal(imagem.headers.get("content-type"), "image/jpeg");
  const meta = await sharp(Buffer.from(await imagem.arrayBuffer())).metadata();
  assert.equal(meta.width, 512); assert.equal(meta.exif, undefined);
  assert.equal((await fetch(`${base}/usuarios/${op}/foto`, { headers: auth(aluno) })).status, 403);
  assert.equal((await api("DELETE", `/usuarios/${aluno}/foto`, aluno, { motivo: "Remover foto" })).status, 403);
  assert.equal((await api("DELETE", `/usuarios/${aluno}/foto`, op, { motivo: "Remover foto" })).status, 200);
  assert.equal(readdirSync(diretorio).length, 0);
  assert.equal((await fetch(`${base}/usuarios/me/foto`, { headers: auth(aluno) })).status, 404);
});
test("upload rejeita conteúdo falso e tamanho excessivo e limpa arquivo em falha", async () => {
  assert.equal((await upload(op, Buffer.from("arquivo falso"))).status, 415);
  assert.equal((await upload(op, Buffer.alloc(5 * 1024 * 1024 + 1))).status, 413);
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).png().toBuffer();
  assert.equal((await upload(op, png, "00000000-0000-4000-8000-000000000099")).status, 404);
  assert.equal(readdirSync(diretorio).length, 0);
});

test("autoedicao permite nome e telefone, rejeita demais dados e preserva carteira", async () => {
  const antes=await prisma.carteira.findUniqueOrThrow({where:{estudanteId:estudante}});
  const res=await api("PATCH","/usuarios/me",aluno,{nome:"Aluno atualizado",telefone:"(53) 99999-9999"});
  assert.equal(res.status,200);assert.equal(res.body.nome,"Aluno atualizado");assert.equal(res.body.telefone,"53999999999");
  for(const body of [{email:"outro@example.com"},{dataNascimento:"2000-01-01"},{estudante:{curso:"Outro"}},{perfil:"OPERADOR"},{fotoChave:"arquivo"},{usuarioId:op,nome:"Indevido"}]) assert.equal((await api("PATCH","/usuarios/me",aluno,body)).status,400);
  const depois=await prisma.carteira.findUniqueOrThrow({where:{estudanteId:estudante}});
  assert.equal(depois.id,antes.id);assert.equal(depois.saldo.toFixed(2),antes.saldo.toFixed(2));
});
