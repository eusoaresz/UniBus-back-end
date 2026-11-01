import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
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
let aluno: string;
let veiculo: string;
let outroVeiculo: string;
const cadastro = { identificacao: "Ônibus teste", placa: " abc-1234 ", tipo: "ONIBUS", capacidade: 40 };
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
  const m = await prisma.motorista.create({ data: { numeroCnh: "12345678901", categoriaCnh: "D", validadeCnh: new Date("2040-12-31"),
    usuario: { create: { nome: "Motorista", cpf: "88888888888", email: "motorista@example.com", telefone: "53999999999", perfil: "MOTORISTA", status: "ATIVA" } } } });
  motorista = m.id; usuarioMotorista = m.usuarioId;
  aluno = (await prisma.usuario.create({ data: { nome: "Aluno", cpf: "77777777777", email: "aluno@example.com", telefone: "53999999999", perfil: "ESTUDANTE", status: "ATIVA" } })).id;
  const app = (await import("../src/app")).default;
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.$disconnect(); await db.close();
});
test("cadastro normaliza placa, nasce ativo e registra autoria", async () => {
  const r = await api("POST", "/veiculos", cadastro);
  assert.equal(r.status, 201, JSON.stringify(r.body)); veiculo = r.body.id;
  assert.equal(r.body.placa, "ABC1234"); assert.equal(r.body.ativo, true); assert.equal(r.body.capacidade, 40);
  const registro = await prisma.alteracaoVeiculo.findFirstOrThrow({ where: { veiculoId: veiculo } });
  assert.equal(registro.realizadaPorId, op); assert.deepEqual(registro.dadosAnteriores, {});
  assert.equal((registro.dadosNovos as any).placa, "ABC1234");
  const van = await api("POST", "/veiculos", { identificacao: "Van teste", placa: "def1g23", tipo: "VAN", capacidade: 15 });
  assert.equal(van.status, 201); assert.equal(van.body.placa, "DEF1G23"); outroVeiculo = van.body.id;
});
test("duplicidade e campos inválidos não geram veículos nem auditorias parciais", async () => {
  const total = await prisma.veiculo.count(), historicos = await prisma.alteracaoVeiculo.count();
  assert.equal((await api("POST", "/veiculos", { ...cadastro, placa: "ABC1234" })).status, 409);
  for (const dados of [{ capacidade: 0 }, { capacidade: -1 }, { capacidade: 1.5 }, { capacidade: "40" }, { capacidade: 2147483648 },
    { placa: "ABC12DE" }, { tipo: "CARRO" }, { ativo: false }, { identificacao: " " }, { id: veiculo }]) {
    assert.equal((await api("POST", "/veiculos", { ...cadastro, ...dados })).status, 400, JSON.stringify(dados));
  }
  assert.equal(await prisma.veiculo.count(), total); assert.equal(await prisma.alteracaoVeiculo.count(), historicos);
});
test("correção de placa preserva identidade e histórico; conflito desfaz todos os campos", async () => {
  const antes = await prisma.alteracaoVeiculo.count();
  assert.equal((await api("PATCH", `/veiculos/${veiculo}`, { placa: "DEF1G23", capacidade: 20, motivo: "Correção cadastral" })).status, 409);
  assert.equal((await prisma.veiculo.findUniqueOrThrow({ where: { id: veiculo } })).capacidade, 40);
  assert.equal(await prisma.alteracaoVeiculo.count(), antes);
  const r = await api("PATCH", `/veiculos/${veiculo}`, { placa: "ABC1D23", motivo: "Correção da placa" });
  assert.equal(r.status, 200); assert.equal(r.body.id, veiculo);
  const h = await api("GET", `/veiculos/${veiculo}/historico`);
  assert.equal(h.status, 200); assert.equal(h.body.dados[0].dadosAnteriores.placa, "ABC1234");
  assert.equal(h.body.dados[0].dadosNovos.placa, "ABC1D23");
  assert.deepEqual(Object.keys(h.body.dados[0].realizadaPor).sort(), ["id", "nome"]);
  for (const dados of [{ capacidade: 20 }, { motivo: "Correção" }, { ativo: false, motivo: "Correção" }]) {
    assert.equal((await api("PATCH", `/veiculos/${veiculo}`, dados)).status, 400);
  }
});
test("consultas e mutações exigem operador ativo e não permitem exclusão", async () => {
  for (const [method, path, body] of [["GET", "/veiculos", undefined], ["GET", `/veiculos/${veiculo}`, undefined],
    ["GET", `/veiculos/${veiculo}/historico`, undefined], ["POST", "/veiculos", cadastro],
    ["PATCH", `/veiculos/${veiculo}`, { capacidade: 20, motivo: "Correção" }],
    ["PATCH", `/veiculos/${veiculo}/status`, { ativo: false, motivo: "Manutenção" }]] as const) {
    assert.equal((await api(method, path, body, null)).status, 401);
    for (const id of [aluno, usuarioMotorista]) assert.equal((await api(method, path, body, id)).status, 403);
  }
  await prisma.usuario.update({ where: { id: op }, data: { status: "INATIVA" } });
  assert.equal((await api("POST", "/veiculos", cadastro)).status, 403);
  await prisma.usuario.update({ where: { id: op }, data: { status: "ATIVA" } });
  assert.equal((await api("DELETE", `/veiculos/${veiculo}`)).status, 404);
});
test("desativação e reativação têm motivo e filtros tratam false corretamente", async () => {
  assert.equal((await api("PATCH", `/veiculos/${outroVeiculo}/status`, { ativo: false })).status, 400);
  assert.equal((await api("PATCH", `/veiculos/${outroVeiculo}/status`, { ativo: "false", motivo: "Manutenção" })).status, 400);
  assert.equal((await api("PATCH", `/veiculos/${outroVeiculo}/status`, { ativo: false, motivo: "Manutenção" })).status, 200);
  const lista = await api("GET", "/veiculos?ativo=false&tipo=VAN&identificacao=teste&limite=1");
  assert.equal(lista.body.dados.length, 1); assert.equal(lista.body.dados[0].id, outroVeiculo);
  assert.equal((await api("GET", "/veiculos?placa=abc1d23")).body.dados[0].id, veiculo);
  assert.equal((await api("GET", "/veiculos?limite=1")).body.meta.temProxima, true);
  for (const query of ["ativo=0", "limite=101", "pagina=0", "outro=1"]) assert.equal((await api("GET", `/veiculos?${query}`)).status, 400);
  assert.equal((await api("GET", "/veiculos/invalido")).status, 400);
  assert.equal((await api("GET", "/veiculos/00000000-0000-4000-8000-000000000001")).status, 404);
  assert.equal((await api("PATCH", `/veiculos/${outroVeiculo}/status`, { ativo: true, motivo: "Manutenção concluída" })).status, 200);
  assert.equal(await prisma.alteracaoVeiculo.count({ where: { veiculoId: outroVeiculo } }), 3);
});
test("vínculos normais e extras bloqueiam desativação sem modificar dados ou histórico", async () => {
  const rota = await prisma.rota.create({ data: { nome: "Rota de teste" } });
  const viagem = await prisma.viagem.create({ data: { data: new Date("2030-01-01"), turno: "MANHA", nomeRota: rota.nome, rotaId: rota.id, criadaPorId: op } });
  const trecho = await prisma.trechoViagem.create({ data: { viagemId: viagem.id, sentido: "IDA", status: "ABERTO",
    veiculoId: veiculo, motoristaId: motorista, capacidade: 40,
    saidaPrevistaEm: new Date("2030-01-01T10:00:00Z"), chegadaPrevistaEm: new Date("2030-01-01T11:00:00Z"),
    limiteConfirmacaoEm: new Date("2030-01-01T09:00:00Z"), limiteCancelamentoEm: new Date("2030-01-01T09:00:00Z") } });
  const total = await prisma.alteracaoVeiculo.count();
  for (const status of ["ABERTO", "FECHADO", "EM_ANDAMENTO"] as const) {
    for (const extra of [false, true]) {
      await prisma.trechoViagem.update({ where: { id: trecho.id }, data: { status,
        veiculoId: extra ? null : veiculo, motoristaId: extra ? null : motorista,
        veiculoExtraId: extra ? veiculo : null, motoristaExtraId: extra ? motorista : null } });
      assert.equal((await api("PATCH", `/veiculos/${veiculo}/status`, { ativo: false, motivo: "Manutenção" })).status, 409);
    }
  }
  assert.equal(await prisma.alteracaoVeiculo.count(), total);
  assert.equal((await prisma.veiculo.findUniqueOrThrow({ where: { id: veiculo } })).ativo, true);
  await prisma.trechoViagem.update({ where: { id: trecho.id }, data: { status: "ABERTO", veiculoId: veiculo, motoristaId: motorista, veiculoExtraId: null, motoristaExtraId: null } });
  const { validarAlocacao } = await import("../src/modules/operacao/recursos.service");
  const validar = () => prisma.$transaction(async tx => {
    const t = await tx.trechoViagem.findUniqueOrThrow({ where: { id: trecho.id }, include: { viagem: true } });
    await validarAlocacao(tx, t);
  });
  await validar();
  assert.equal((await api("PATCH", `/veiculos/${veiculo}`, { capacidade: 20, motivo: "Correção de capacidade" })).status, 200);
  assert.equal((await prisma.trechoViagem.findUniqueOrThrow({ where: { id: trecho.id } })).capacidade, 40);
  await assert.rejects(validar, /Capacidade do veículo foi reduzida/);
  await prisma.trechoViagem.update({ where: { id: trecho.id }, data: { capacidade: 20 } });
  await validar();
  await prisma.trechoViagem.update({ where: { id: trecho.id }, data: { status: "CONCLUIDO" } });
  assert.equal((await api("PATCH", `/veiculos/${veiculo}/status`, { ativo: false, motivo: "Manutenção" })).status, 200);
  assert.equal((await prisma.trechoViagem.findUniqueOrThrow({ where: { id: trecho.id } })).veiculoId, veiculo);
});
