import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
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
let op: string;
let motorista: string;
let usuarioMotorista: string;
const cnh = { numeroCnh: "12345678901", categoriaCnh: "D", validadeCnh: "2035-12-31" };
const cadastro = { nome: "Motorista de teste", cpf: "52998224725", email: "motorista@example.com", telefone: "53999999999", senha: "SenhaForte123!", ...cnh };
async function api(method: string, path: string, body?: unknown, id: string | null = op) {
  const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json",
    ...(id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET!)}` } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() as any };
}
before(async () => {
  for (const pasta of readdirSync("prisma/migrations").filter(p => /^\d/.test(p)).sort()) await db.exec(readFileSync(`prisma/migrations/${pasta}/migration.sql`, "utf8"));
  (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
  op = (await prisma.usuario.create({ data: { nome: "Operador", cpf: "99999999999", email: "op@example.com", telefone: "53999999999", perfil: "OPERADOR", status: "ATIVA" } })).id;
  const app = (await import("../src/app")).default;
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.$disconnect(); await db.close();
});

test("cadastro completo cria motorista ativo, senha protegida e histórico sem credenciais", async () => {
  const r = await api("POST", "/motoristas", cadastro);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  motorista = r.body.id; usuarioMotorista = r.body.usuarioId;
  assert.equal(r.body.usuario.status, "ATIVA");
  assert.equal(r.body.validadeCnh, cnh.validadeCnh);
  const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: usuarioMotorista } });
  assert.equal(usuario.perfil, "MOTORISTA");
  assert.equal(usuario.cadastradoPorId, op);
  assert.ok(await bcrypt.compare(cadastro.senha, usuario.senhaHash!));
  const registro = await prisma.alteracaoPerfil.findFirstOrThrow({ where: { usuarioId: usuarioMotorista } });
  for (const campo of ["senha", "senhaHash", "cpf"]) {
    assert.equal(campo in r.body.usuario, false);
    assert.equal(JSON.stringify(registro).includes(`"${campo}"`), false);
  }
  assert.equal((await api("POST", "/auth/login", { email: cadastro.email, senha: cadastro.senha }, null)).status, 200);
});

test("duplicidades e dados inválidos não deixam conta ou histórico parcial", async () => {
  const usuarios = await prisma.usuario.count(); const registros = await prisma.alteracaoPerfil.count();
  assert.equal((await api("POST", "/motoristas", { ...cadastro, cpf: "11144477735", email: "outro@example.com" })).status, 409);
  assert.equal((await api("POST", "/motoristas", { ...cadastro, numeroCnh: "23456789012" })).status, 409);
  for (const alteracao of [{ status: "ATIVA" }, { perfil: "OPERADOR" }, { categoriaCnh: "B" }, { numeroCnh: "123" }, { validadeCnh: "2035-02-30" }]) {
    assert.equal((await api("POST", "/motoristas", { ...cadastro, ...alteracao })).status, 400);
  }
  assert.equal(await prisma.usuario.count(), usuarios);
  assert.equal(await prisma.alteracaoPerfil.count(), registros);
  assert.equal((await api("POST", "/usuarios", { nome: cadastro.nome, cpf: "11144477735", email: "outro@example.com", telefone: cadastro.telefone, senha: cadastro.senha, perfil: "MOTORISTA" })).status, 409);
});

test("complemento preserva status, senha e identidade e rejeita perfil incorreto ou duplicado", async () => {
  const u = await prisma.usuario.create({ data: { nome: "Legado", cpf: "00000000001", email: "legado@example.com", telefone: cadastro.telefone, perfil: "MOTORISTA", status: "BLOQUEADA", senhaHash: "hash-preservado" } });
  const dados = { ...cnh, numeroCnh: "23456789012", motivo: "Complemento do cadastro existente" };
  assert.equal((await api("POST", `/motoristas/usuarios/${u.id}`, dados)).status, 201);
  const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } });
  assert.equal(depois.status, "BLOQUEADA"); assert.equal(depois.senhaHash, "hash-preservado");
  assert.equal((await api("POST", `/motoristas/usuarios/${u.id}`, dados)).status, 409);
  assert.equal((await api("POST", `/motoristas/usuarios/${op}`, dados)).status, 409);
  assert.equal((await api("POST", `/motoristas/usuarios/${u.id}`, cnh)).status, 400);
});

test("edição da CNH exige motivo e mantém histórico atômico", async () => {
  assert.equal((await api("PATCH", `/motoristas/${motorista}`, { categoriaCnh: "E" })).status, 400);
  const antes = await prisma.alteracaoPerfil.count();
  assert.equal((await api("PATCH", `/motoristas/${motorista}`, { numeroCnh: "23456789012", motivo: "Correção" })).status, 409);
  assert.equal(await prisma.alteracaoPerfil.count(), antes);
  const r = await api("PATCH", `/motoristas/${motorista}`, { categoriaCnh: "E", motivo: "Atualização da categoria" });
  assert.equal(r.status, 200); assert.equal(r.body.categoriaCnh, "E");
  const registros = await prisma.alteracaoPerfil.findMany({ where: { usuarioId: usuarioMotorista, motivo: "Atualização da categoria" } });
  assert.equal(registros.length, 1);
  assert.equal((registros[0].dadosAnteriores as any).categoriaCnh, "D");
  assert.equal((registros[0].dadosNovos as any).categoriaCnh, "E");
});

test("rotas exigem operador, listam com filtros e não oferecem exclusão", async () => {
  for (const [method, path, body] of [["GET", "/motoristas", undefined], ["GET", `/motoristas/${motorista}`, undefined], ["POST", "/motoristas", cadastro], ["PATCH", `/motoristas/${motorista}`, { categoriaCnh: "D", motivo: "Correção" }], ["POST", `/motoristas/usuarios/${usuarioMotorista}`, { ...cnh, motivo: "Complemento" }]] as const) {
    assert.equal((await api(method, path, body, null)).status, 401);
    assert.equal((await api(method, path, body, usuarioMotorista)).status, 403);
  }
  const lista = await api("GET", "/motoristas?status=ATIVA&nome=teste&limite=1");
  assert.equal(lista.status, 200); assert.equal(lista.body.dados.length, 1);
  assert.equal(lista.body.dados[0].id, motorista);
  assert.equal((await api("GET", "/motoristas?limite=101")).status, 400);
  assert.equal((await api("GET", "/motoristas/invalido")).status, 400);
  assert.equal((await api("DELETE", `/motoristas/${motorista}`)).status, 404);
});

test("status exige motivo e resolução de vínculos normais e extras antes de bloqueio ou desativação", async () => {
  const veiculo = await prisma.veiculo.create({ data: { identificacao: "Van de teste", placa: "ABC1D23", tipo: "VAN", capacidade: 15 } });
  const rota = await prisma.rota.create({ data: { nome: "Rota teste" } });
  const viagem = await prisma.viagem.create({ data: { data: new Date("2030-01-01"), turno: "MANHA", nomeRota: rota.nome, rotaId: rota.id, criadaPorId: op } });
  const trecho = await prisma.trechoViagem.create({ data: { viagemId: viagem.id, sentido: "IDA", status: "ABERTO", motoristaId: motorista,
    saidaPrevistaEm: new Date("2030-01-01T10:00:00Z"), chegadaPrevistaEm: new Date("2030-01-01T11:00:00Z"), limiteConfirmacaoEm: new Date("2030-01-01T09:00:00Z"), limiteCancelamentoEm: new Date("2030-01-01T09:00:00Z") } });
  assert.equal((await api("PATCH", `/usuarios/${usuarioMotorista}/status`, { status: "INATIVA" })).status, 400);
  const antes = await prisma.alteracaoPerfil.count();
  for (const statusTrecho of ["ABERTO", "FECHADO", "EM_ANDAMENTO"] as const) {
    for (const extra of [false, true]) {
      await prisma.trechoViagem.update({ where: { id: trecho.id }, data: { status: statusTrecho,
        motoristaId: extra ? null : motorista, motoristaExtraId: extra ? motorista : null,
        veiculoId: extra ? null : veiculo.id, veiculoExtraId: extra ? veiculo.id : null } });
      for (const status of ["INATIVA", "BLOQUEADA"]) assert.equal((await api("PATCH", `/usuarios/${usuarioMotorista}/status`, { status, motivo: "Afastamento" })).status, 409);
    }
  }
  assert.equal(await prisma.alteracaoPerfil.count(), antes);
  assert.equal((await prisma.usuario.findUniqueOrThrow({ where: { id: usuarioMotorista } })).status, "ATIVA");
  await prisma.trechoViagem.update({ where: { id: trecho.id }, data: { status: "CANCELADO" } });
  assert.equal((await api("PATCH", `/usuarios/${usuarioMotorista}/status`, { status: "INATIVA", motivo: "Afastamento" })).status, 200);
  assert.equal(await prisma.alteracaoPerfil.count(), antes + 1);
  assert.equal((await api("GET", "/usuarios/me", undefined, usuarioMotorista)).status, 403);
  assert.equal(await prisma.motorista.count({ where: { id: motorista } }), 1);
});
