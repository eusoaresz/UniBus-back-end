import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { Prisma } from "../generated/prisma";

process.env.JWT_SECRET = "segredo-exclusivo-dos-testes-sem-uso-real";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.MAILTRAP_USER = "test";
process.env.MAILTRAP_PASS = "test";
process.env.SMTP_FROM = "test@example.com";

const id = "00000000-0000-4000-8000-000000000001";
const dados = {
  data: "2026-11-02", turno: "NOITE", rotaId: id,
  trechos: [
    { sentido: "IDA", saidaPrevistaEm: "2026-11-02T18:00:00-03:00", chegadaPrevistaEm: "2026-11-02T19:00:00-03:00" },
    { sentido: "VOLTA", saidaPrevistaEm: "2026-11-02T22:00:00-03:00", chegadaPrevistaEm: "2026-11-02T23:00:00-03:00" },
  ],
};
let server: Server;
let base: string;
let prisma: typeof import("../lib/prisma").prisma;
let perfil: string;
let conta: string;
let rota: any;
let registro: any;
let criacao: any;
let listagem: any;
let participacoes: number;
let transacoes: number;
let falhasConcorrencia: number;
let duplicada: boolean;
let alteracoes: any[];
const restaurar: Array<() => void> = [];

function substituir(objeto: any, nome: string, metodo: any) {
  const original = objeto[nome];
  objeto[nome] = metodo;
  restaurar.push(() => { objeto[nome] = original; });
}

function viagem() {
  return {
    id, data: new Date(dados.data), turno: "NOITE", rotaId: id, nomeRota: "Centro", status: "RASCUNHO",
    trechos: dados.trechos.map((t, i) => ({
      ...t, id: `trecho-${i}`, status: "RASCUNHO", tarifa: new Prisma.Decimal("2"), paradas: [],
      saidaPrevistaEm: new Date(t.saidaPrevistaEm), chegadaPrevistaEm: new Date(t.chegadaPrevistaEm),
    })),
  };
}

before(async () => {
  prisma = (await import("../lib/prisma")).prisma;
  substituir(prisma.usuario, "findUnique", async () => ({ id, perfil, status: conta }));
  substituir(prisma.rota, "findUnique", async () => rota);
  substituir(prisma.viagem, "findUnique", async () => registro);
  substituir(prisma.viagem, "findMany", async (args: any) => { listagem = args; return Array.from({ length: args.take }, viagem); });
  substituir(prisma.viagem, "create", async (args: any) => {
    criacao = args;
    if (duplicada) throw { code: "P2002" };
    return viagem();
  });
  substituir(prisma.viagem, "update", async () => registro);
  substituir(prisma.participacaoTrecho, "count", async () => participacoes);
  substituir(prisma.paradaTrecho, "deleteMany", async (args: any) => { alteracoes.push({ remover: args }); return { count: 3 }; });
  substituir(prisma.trechoViagem, "update", async (args: any) => { alteracoes.push(args); return {}; });
  substituir(prisma, "$transaction", async (fn: any, options: any) => {
    transacoes++;
    assert.equal(options.isolationLevel, "Serializable");
    if (falhasConcorrencia-- > 0) throw { code: "P2034" };
    return fn(prisma);
  });
  const app = (await import("../src/app")).default;
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/viagens`;
});

beforeEach(() => {
  perfil = "OPERADOR"; conta = "ATIVA"; participacoes = 0; transacoes = 0;
  falhasConcorrencia = 0; duplicada = false; alteracoes = []; criacao = undefined;
  registro = viagem();
  rota = { nome: "Centro", ativa: true, paradas: ["Prefeitura", "Praça", "Instituição"].map((nome, i) => ({
    pontoParada: { id: `ponto-${i}`, nome, cidade: i < 2 ? "Pedro Osório" : "Pelotas", ativo: true, endereco: null, referencia: null },
  })) };
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
  restaurar.reverse().forEach((fn) => fn());
  await prisma?.$disconnect();
});

function requisicao(method: string, path = "", body?: unknown, autenticado = true) {
  const token = jwt.sign({ id, perfil: "OPERADOR" }, process.env.JWT_SECRET!);
  return fetch(`${base}${path}`, {
    method, headers: { "Content-Type": "application/json", ...(autenticado ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

for (const [method, path] of [["GET", ""], ["POST", ""], ["GET", `/${id}`], ["PUT", `/${id}`]]) {
  test(`${method} ${path || "/"} exige operador ativo`, async () => {
    const body = ["PUT", "POST"].includes(method) ? dados : undefined;
    assert.equal((await requisicao(method, path, body, false)).status, 401);
    for (const valor of ["ESTUDANTE", "MOTORISTA"]) {
      perfil = valor;
      assert.equal((await requisicao(method, path, body)).status, 403);
    }
    perfil = "OPERADOR"; conta = "BLOQUEADA";
    assert.equal((await requisicao(method, path, body)).status, 403);
    assert.equal(transacoes, 0);
  });
}

test("cria os dois trechos com prazos e paradas inversas, sem cobrar", async () => {
  const res = await requisicao("POST", "", dados);
  assert.equal(res.status, 201);
  assert.equal((await res.json() as any).trechos[0].tarifa, "2.00");
  assert.equal(criacao.data.criadaPorId, id);
  assert.equal(criacao.data.nomeRota, "Centro");
  const [ida, volta] = criacao.data.trechos.create;
  assert.equal(ida.limiteConfirmacaoEm.toISOString(), "2026-11-02T20:00:00.000Z");
  assert.equal(volta.limiteCancelamentoEm.toISOString(), "2026-11-03T00:00:00.000Z");
  assert.deepEqual(ida.paradas.create.map((p: any) => p.nome), ["Prefeitura", "Praça", "Instituição"]);
  assert.deepEqual(volta.paradas.create.map((p: any) => p.nome), ["Instituição", "Praça", "Prefeitura"]);
  assert.equal(transacoes, 1);
});

test("rejeita rota inexistente, inativa, incompleta, com ponto inativo ou início incorreto", async () => {
  const original = structuredClone(rota);
  rota = null;
  assert.equal((await requisicao("POST", "", dados)).status, 404);
  for (const mudar of [
    () => { rota.ativa = false; },
    () => { rota.paradas.pop(); },
    () => { rota.paradas[2].pontoParada.ativo = false; },
    () => { rota.paradas.reverse(); },
    () => { rota.paradas[0].pontoParada.cidade = "Pelotas"; },
  ]) {
    rota = structuredClone(original); mudar();
    assert.equal((await requisicao("POST", "", dados)).status, 409);
  }
  assert.equal(criacao, undefined);
});

test("conflito de unicidade retorna 409 e concorrência tem tentativas limitadas", async () => {
  duplicada = true;
  assert.equal((await requisicao("POST", "", dados)).status, 409);
  duplicada = false; transacoes = 0; falhasConcorrencia = 1;
  assert.equal((await requisicao("POST", "", dados)).status, 201);
  assert.equal(transacoes, 2);
  transacoes = 0; falhasConcorrencia = 3;
  assert.equal((await requisicao("POST", "", dados)).status, 409);
  assert.equal(transacoes, 3);
});

test("lista com filtros e paginação limitada", async () => {
  const res = await requisicao("GET", "?limite=2&pagina=2&status=RASCUNHO&data=2026-11-02");
  const body = await res.json() as any;
  assert.equal(res.status, 200);
  assert.equal(body.dados.length, 2);
  assert.deepEqual(body.meta, { pagina: 2, limite: 2, temProxima: true });
  assert.equal(listagem.skip, 2);
  assert.equal(listagem.where.status, "RASCUNHO");
  assert.equal(listagem.where.data.toISOString(), "2026-11-02T00:00:00.000Z");
  for (const query of ["limite=101", "pagina=0", "status=INVALIDO", "rotaId=invalido", "data=2026-02-30", "nome=teste"]) {
    assert.equal((await requisicao("GET", `?${query}`)).status, 400);
  }
});

test("consulta valida identificador e trata viagem ausente", async () => {
  assert.equal((await requisicao("GET", "/invalido")).status, 400);
  assert.equal((await requisicao("GET", `/${id}`)).status, 200);
  registro = null;
  assert.equal((await requisicao("GET", `/${id}`)).status, 404);
});

test("edição exige motivo e registra autor e estados dos dois trechos", async () => {
  assert.equal((await requisicao("PUT", `/${id}`, dados)).status, 400);
  assert.equal((await requisicao("PUT", `/${id}`, { ...dados, motivo: "Ajuste dos horários" })).status, 200);
  const updates = alteracoes.filter((a) => a.data);
  assert.equal(updates.length, 2);
  assert.equal(updates[0].data.alteracoes.create.realizadaPorId, id);
  assert.equal(updates[0].data.alteracoes.create.motivo, "Ajuste dos horários");
  assert.ok(updates[0].data.alteracoes.create.dadosAnteriores);
  assert.ok(updates[0].data.alteracoes.create.dadosNovos);
});

test("edição não altera viagem publicada, trecho aberto ou rascunho com participações", async () => {
  for (const mudar of [
    () => { registro.status = "PROGRAMADA"; },
    () => { registro.trechos[0].status = "ABERTO"; },
    () => { participacoes = 1; },
    () => { registro.trechos.pop(); },
  ]) {
    registro = viagem(); participacoes = 0; mudar();
    assert.equal((await requisicao("PUT", `/${id}`, { ...dados, motivo: "Alteração de teste" })).status, 409);
  }
  assert.equal(alteracoes.length, 0);
  registro = null;
  assert.equal((await requisicao("PUT", `/${id}`, { ...dados, motivo: "Alteração de teste" })).status, 404);
});

test("rejeita data divergente da saída local e aceita representação UTC equivalente", async () => {
  assert.equal((await requisicao("POST", "", { ...dados, data: "2026-11-03" })).status, 400);
  const copia = structuredClone(dados);
  copia.trechos[0].saidaPrevistaEm = "2026-11-02T21:00:00Z";
  assert.equal((await requisicao("POST", "", copia)).status, 201);
});
