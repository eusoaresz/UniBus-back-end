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
let aluno: string;
let motorista: string;
let instituicao: string;
let unidade: string;
let ponto: string;
async function api(method: string, path: string, body?: unknown, id: string | null = op) {
  const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json",
    ...(id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET!, { expiresIn: "1h" })}` } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() as any };
}
async function criarPonto(nome = "Campus") {
  const r = await api("POST", "/pontos-parada", { nome, cidade: "Pelotas", endereco: "Rua original" });
  assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body.id as string;
}
before(async () => {
  for (const pasta of readdirSync("prisma/migrations").filter(p => /^\d/.test(p)).sort()) await db.exec(readFileSync(`prisma/migrations/${pasta}/migration.sql`, "utf8"));
  (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
  op = (await prisma.usuario.create({ data: { nome: "Operador", cpf: "99999999999", email: "op@example.com", telefone: "53999999999", perfil: "OPERADOR", status: "ATIVA" } })).id;
  aluno = (await prisma.usuario.create({ data: { nome: "Aluno", cpf: "88888888888", email: "aluno@example.com", telefone: "53999999999", perfil: "ESTUDANTE", status: "ATIVA" } })).id;
  motorista = (await prisma.usuario.create({ data: { nome: "Motorista", cpf: "77777777777", email: "motorista@example.com", telefone: "53999999999", perfil: "MOTORISTA", status: "ATIVA" } })).id;
  const app = (await import("../src/app")).default;
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.$disconnect(); await db.close();
});
test("cadastros nascem ativos, exigem ponto exclusivo e auditam o autor", async () => {
  const i = await api("POST", "/instituicoes", { nome: "Universidade teste", tipo: "FACULDADE" });
  assert.equal(i.status, 201); instituicao = i.body.id; assert.equal(i.body.ativa, true);
  ponto = await criarPonto();
  const u = await api("POST", "/unidades-ensino", { nome: "Campus teste", instituicaoEnsinoId: instituicao, pontoParadaId: ponto });
  assert.equal(u.status, 201); unidade = u.body.id;
  assert.equal(await prisma.alteracaoEnsino.count(), 3);
  const total = await prisma.alteracaoEnsino.count();
  assert.equal((await api("POST", "/unidades-ensino", { nome: "Outra unidade", instituicaoEnsinoId: instituicao, pontoParadaId: ponto })).status, 409);
  assert.equal(await prisma.alteracaoEnsino.count(), total);
  const historico = await api("GET", `/unidades-ensino/${unidade}/historico`);
  assert.equal(historico.body.dados[0].realizadaPor.id, op);
  assert.deepEqual(Object.keys(historico.body.dados[0].realizadaPor).sort(), ["id", "nome"]);
});
test("todas as rotas são exclusivas de operador e não oferecem exclusão", async () => {
  for (const [path, id] of [["instituicoes", instituicao], ["unidades-ensino", unidade], ["pontos-parada", ponto]]) {
    for (const [method, suffix, body] of [["GET", "", undefined], ["POST", "", {}], ["GET", `/${id}`, undefined],
      ["PATCH", `/${id}`, { nome: "Outro", motivo: "Correção" }], ["PATCH", `/${id}/status`, { ativo: false, motivo: "Desativação" }],
      ["GET", `/${id}/historico`, undefined]] as const) {
      assert.equal((await api(method, `/${path}${suffix}`, body, null)).status, 401);
      for (const ator of [aluno, motorista]) assert.equal((await api(method, `/${path}${suffix}`, body, ator)).status, 403);
    }
    assert.equal((await api("DELETE", `/${path}/${id}`)).status, 404);
  }
  await prisma.usuario.update({ where: { id: op }, data: { status: "INATIVA" } });
  assert.equal((await api("GET", "/instituicoes")).status, 403);
  await prisma.usuario.update({ where: { id: op }, data: { status: "ATIVA" } });
});
test("unidade exige vínculos ativos; edição e reativação não contornam as restrições", async () => {
  const p = await criarPonto("Ponto para unidade");
  await api("PATCH", `/pontos-parada/${p}/status`, { ativo: false, motivo: "Indisponível" });
  assert.equal((await api("POST", "/unidades-ensino", { nome: "Nova", instituicaoEnsinoId: instituicao, pontoParadaId: p })).status, 409);
  assert.equal((await api("PATCH", `/unidades-ensino/${unidade}`, { pontoParadaId: p, motivo: "Troca" })).status, 409);
  assert.equal((await api("PATCH", `/unidades-ensino/${unidade}`, { instituicaoEnsinoId: instituicao, motivo: "Troca" })).status, 400);
  await api("PATCH", `/pontos-parada/${p}/status`, { ativo: true, motivo: "Disponível" });
  await api("PATCH", `/instituicoes/${instituicao}/status`, { ativo: false, motivo: "Sem oferta" });
  assert.equal((await api("POST", "/unidades-ensino", { nome: "Nova", instituicaoEnsinoId: instituicao, pontoParadaId: p })).status, 409);
  await api("PATCH", `/unidades-ensino/${unidade}/status`, { ativo: false, motivo: "Sem oferta" });
  assert.equal((await api("PATCH", `/unidades-ensino/${unidade}/status`, { ativo: true, motivo: "Retorno" })).status, 409);
  await api("PATCH", `/instituicoes/${instituicao}/status`, { ativo: true, motivo: "Retorno" });
  assert.equal((await api("PATCH", `/unidades-ensino/${unidade}/status`, { ativo: true, motivo: "Retorno" })).status, 200);
});
test("aprovados e suspensos impedem desativação; transferência mantém saldo e permite resolver o vínculo", async () => {
  const e = await prisma.estudante.create({ data: { usuarioId: aluno, unidadeEnsinoId: unidade, matricula: "001", previsaoConclusao: new Date("2035-12-31"), statusCadastro: "APROVADO", carteira: { create: { saldo: "12.00" } } } });
  const total = await prisma.alteracaoEnsino.count();
  for (const statusCadastro of ["APROVADO", "SUSPENSO"] as const) {
    await prisma.estudante.update({ where: { id: e.id }, data: { statusCadastro } });
    for (const path of [`/instituicoes/${instituicao}`, `/unidades-ensino/${unidade}`]) {
      assert.equal((await api("PATCH", `${path}/status`, { ativo: false, motivo: "Encerramento" })).status, 409);
    }
  }
  assert.equal(await prisma.alteracaoEnsino.count(), total);
  await prisma.estudante.update({ where: { id: e.id }, data: { statusCadastro: "APROVADO" } });
  const novaInstituicao = await api("POST", "/instituicoes", { nome: "Instituição destino", tipo: "TECNICA" });
  const novoPonto = await criarPonto("Destino");
  const novaUnidade = await api("POST", "/unidades-ensino", { nome: "Unidade destino", instituicaoEnsinoId: novaInstituicao.body.id, pontoParadaId: novoPonto });
  const transferencia = await api("PATCH", `/usuarios/${aluno}/dados`, { estudante: { unidadeEnsinoId: novaUnidade.body.id }, motivo: "Transferência de unidade" });
  assert.equal(transferencia.status, 200, JSON.stringify(transferencia.body));
  for (const path of [`/instituicoes/${instituicao}`, `/unidades-ensino/${unidade}`]) assert.equal((await api("PATCH", `${path}/status`, { ativo: false, motivo: "Encerramento" })).status, 200);
  const depois = await prisma.estudante.findUniqueOrThrow({ where: { id: e.id }, include: { carteira: true } });
  assert.equal(depois.carteira!.saldo.toFixed(2), "12.00"); assert.equal(depois.unidadeEnsinoId, novaUnidade.body.id);
  assert.equal(depois.statusCadastro, "APROVADO");
});
test("pontos exigem resolver unidades ativas, rotas ativas e trechos em operação", async () => {
  await api("PATCH", `/instituicoes/${instituicao}/status`, { ativo: true, motivo: "Retorno" });
  await api("PATCH", `/unidades-ensino/${unidade}/status`, { ativo: true, motivo: "Retorno" });
  const desativar = () => api("PATCH", `/pontos-parada/${ponto}/status`, { ativo: false, motivo: "Mudança de parada" });
  assert.equal((await desativar()).status, 409);
  await api("PATCH", `/unidades-ensino/${unidade}/status`, { ativo: false, motivo: "Mudança" });
  const rota = await prisma.rota.create({ data: { nome: "Rota histórica", paradas: { create: { pontoParadaId: ponto, ordem: 1 } } } });
  assert.equal((await desativar()).status, 409);
  await prisma.rota.update({ where: { id: rota.id }, data: { ativa: false } });
  const viagem = await prisma.viagem.create({ data: { data: new Date("2030-01-01"), turno: "MANHA", nomeRota: rota.nome, rotaId: rota.id, criadaPorId: op } });
  const trecho = await prisma.trechoViagem.create({ data: { viagemId: viagem.id, sentido: "IDA", status: "ABERTO",
    saidaPrevistaEm: new Date("2030-01-01T10:00:00Z"), chegadaPrevistaEm: new Date("2030-01-01T11:00:00Z"),
    limiteConfirmacaoEm: new Date("2030-01-01T09:00:00Z"), limiteCancelamentoEm: new Date("2030-01-01T09:00:00Z") } });
  const parada = await prisma.paradaTrecho.create({ data: { trechoId: trecho.id, pontoParadaId: ponto, ordem: 1, nome: "Campus original", cidade: "Pelotas", endereco: "Rua original" } });
  for (const status of ["ABERTO", "FECHADO", "EM_ANDAMENTO"] as const) {
    await prisma.trechoViagem.update({ where: { id: trecho.id }, data: { status } });
    assert.equal((await desativar()).status, 409);
  }
  assert.equal((await api("PATCH", `/pontos-parada/${ponto}`, { nome: "Campus novo", endereco: "Rua nova", motivo: "Correção cadastral" })).status, 200);
  const preservada = await prisma.paradaTrecho.findUniqueOrThrow({ where: { id: parada.id } });
  assert.equal(preservada.nome, "Campus original"); assert.equal(preservada.endereco, "Rua original");
  await prisma.paradaTrecho.update({ where: { id: parada.id }, data: { ativa: false } });
  assert.equal((await desativar()).status, 200);
  assert.equal((await api("PATCH", `/unidades-ensino/${unidade}/status`, { ativo: true, motivo: "Retorno" })).status, 409);
  assert.equal(await prisma.paradaTrecho.count({ where: { id: parada.id } }), 1);
});
test("validação, paginação e histórico não aceitam campos extras ou motivos ausentes", async () => {
  for (const [path, id] of [["instituicoes", instituicao], ["unidades-ensino", unidade], ["pontos-parada", ponto]]) {
    for (const corpo of [{ nome: "Correção" }, { motivo: "Correção" }, { nome: "Correção", ativo: true, motivo: "Correção" }]) {
      assert.equal((await api("PATCH", `/${path}/${id}`, corpo)).status, 400);
    }
    assert.equal((await api("PATCH", `/${path}/${id}/status`, { ativo: false })).status, 400);
    assert.equal((await api("GET", `/${path}?limite=101`)).status, 400);
    assert.equal((await api("GET", `/${path}?ativo=0`)).status, 400);
    assert.equal((await api("GET", `/${path}/invalido`)).status, 400);
    const h = await api("GET", `/${path}/${id}/historico?limite=1`);
    assert.equal(h.status, 200); assert.equal(h.body.dados.length, 1); assert.equal(h.body.meta.temProxima, true);
  }
  const lista = await api("GET", "/pontos-parada?ativo=false&nome=campus");
  assert.equal(lista.body.dados.some((p: { id: string }) => p.id === ponto), true);
  assert.equal((await api("POST", "/instituicoes", { nome: "Inválida", tipo: "OUTRA" })).status, 400);
  assert.equal((await api("POST", "/pontos-parada", { nome: "Novo", cidade: "Pelotas", ativo: false })).status, 400);
});
test("auditoria exige exatamente um alvo e falha de auditoria desfaz edição", async () => {
  for (const campos of [{}, { instituicaoEnsinoId: instituicao, pontoParadaId: ponto }]) {
    await assert.rejects(prisma.alteracaoEnsino.create({ data: { ...campos, realizadaPorId: op, motivo: "Inválido", dadosAnteriores: {}, dadosNovos: {} } }));
  }
  const anterior = await prisma.pontoParada.findUniqueOrThrow({ where: { id: ponto } });
  const total = await prisma.alteracaoEnsino.count();
  await db.exec(`CREATE FUNCTION rejeitar_auditoria_teste() RETURNS trigger AS $$ BEGIN IF NEW.motivo = 'Falha controlada' THEN RAISE EXCEPTION 'falha de teste'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
    CREATE TRIGGER rejeitar_auditoria_teste BEFORE INSERT ON "AlteracaoEnsino" FOR EACH ROW EXECUTE FUNCTION rejeitar_auditoria_teste();`);
  try {
    assert.equal((await api("PATCH", `/pontos-parada/${ponto}`, { nome: "Não persistir", motivo: "Falha controlada" })).status, 500);
    assert.equal((await prisma.pontoParada.findUniqueOrThrow({ where: { id: ponto } })).nome, anterior.nome);
    assert.equal(await prisma.alteracaoEnsino.count(), total);
  } finally {
    await db.exec('DROP TRIGGER rejeitar_auditoria_teste ON "AlteracaoEnsino"; DROP FUNCTION rejeitar_auditoria_teste();');
  }
});
