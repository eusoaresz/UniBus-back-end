import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

process.env.JWT_SECRET = "segredo-exclusivo-dos-testes-sem-uso-real";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.MAILTRAP_USER = "test";
process.env.MAILTRAP_PASS = "test";
process.env.SMTP_FROM = "test@example.com";

const id = "00000000-0000-4000-8000-000000000001";
let server: Server;
let base: string;
let prisma: typeof import("../lib/prisma").prisma;
let senhaHash: string;
let usuario: Record<string, unknown> | null;
let consultas: number;
let cadastros: number;
let ultimoCadastro: any;
let ultimaConsulta: any;
let ultimaAtualizacao: any;
let erroCadastro: unknown;
const restaurar: Array<() => void> = [];

function substituirMetodo(nome: "findUnique" | "findFirst" | "findMany" | "create" | "update", substituto: (...args: any[]) => Promise<any>) {
  const original = prisma.usuario[nome];
  Object.assign(prisma.usuario, { [nome]: substituto });
  restaurar.push(() => Object.assign(prisma.usuario, { [nome]: original }));
}

before(async () => {
  prisma = (await import("../lib/prisma")).prisma;
  const revogadoOriginal = prisma.tokenRevogado.findUnique;
  Object.assign(prisma.tokenRevogado, { findUnique: async () => null });
  restaurar.push(() => { prisma.tokenRevogado.findUnique = revogadoOriginal; });
  const txOriginal = prisma.$transaction;
  const auditoriaOriginal = prisma.alteracaoPerfil.create;
  Object.assign(prisma, { $transaction: async (fn: any) => fn(prisma) });
  Object.assign(prisma.alteracaoPerfil, { create: async (args: any) => args.data });
  restaurar.push(() => { prisma.$transaction = txOriginal; prisma.alteracaoPerfil.create = auditoriaOriginal; });
  const app = (await import("../src/app")).default;
  senhaHash = await bcrypt.hash("SenhaForte123!", 4);
  const selecionar = (registro: any, select: any) => registro && Object.fromEntries(
    Object.keys(select).map((chave) => [chave, registro[chave]]),
  );
  substituirMetodo("findUnique", async (args: any) => selecionar(usuario, args.select));
  substituirMetodo("findFirst", async () => null);
  substituirMetodo("findMany", async (args: any) => {
    consultas++; ultimaConsulta = args;
    return Array.from({ length: args.take }, () => selecionar(usuario, args.select));
  });
  substituirMetodo("create", async (args: any) => {
    cadastros++;
    ultimoCadastro = args.data;
    if (erroCadastro) throw erroCadastro;
    return selecionar({ ...args.data, id, status: "AGUARDANDO_ATIVACAO" }, args.select);
  });
  substituirMetodo("update", async (args: any) => {
    ultimaAtualizacao = args;
    return selecionar({ ...usuario, ...args.data, id: args.where.id }, args.select);
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(() => {
  usuario = { id, nome: "Teste", cpf: "52998224725", telefone: "53991234567", email: "teste@example.com", perfil: "OPERADOR", status: "ATIVA", senhaHash };
  consultas = 0;
  cadastros = 0;
  ultimaConsulta = undefined;
  ultimaAtualizacao = undefined;
  erroCadastro = undefined;
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  restaurar.forEach((restaurarMetodo) => restaurarMetodo());
  await prisma?.$disconnect();
});

function token(perfil = "OPERADOR", expiresIn = 3600) {
  return jwt.sign({ id, email: "teste@example.com", perfil }, process.env.JWT_SECRET!, { expiresIn });
}

async function requisicao(method: string, path: string, bearer?: string, body?: unknown) {
  return fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const cadastro = { nome: "Teste", cpf: "52998224725", email: "novo@example.com", telefone: "53991234567", senha: "SenhaForte123!", perfil: "OPERADOR" };

for (const method of ["GET", "POST"]) {
  test(`${method} /usuarios exige autenticação`, async () => {
    const res = await requisicao(method, "/usuarios", undefined, method === "POST" ? cadastro : undefined);
    assert.equal(res.status, 401);
    assert.equal(consultas + cadastros, 0);
  });
  for (const perfil of ["ESTUDANTE", "MOTORISTA"]) {
    test(`${method} /usuarios nega ${perfil}, mesmo com perfil OPERADOR no JWT`, async () => {
      usuario!.perfil = perfil;
      const res = await requisicao(method, "/usuarios", token(), method === "POST" ? cadastro : undefined);
      assert.equal(res.status, 403);
      assert.equal(consultas + cadastros, 0);
    });
  }
}

test("operador ativo pode listar usando o perfil atual do banco", async () => {
  const res = await requisicao("GET", "/usuarios", token("ESTUDANTE"));
  assert.equal(res.status, 200);
  assert.equal(consultas, 1);
});

test("operador ativo pode cadastrar e fica registrado como responsável", async () => {
  const res = await requisicao("POST", "/usuarios", token(), cadastro);
  assert.equal(res.status, 201);
  assert.equal(cadastros, 1);
  assert.equal(ultimoCadastro.cadastradoPorId, id);
  assert.equal(ultimoCadastro.perfil, "OPERADOR");
  assert.equal(await bcrypt.compare(cadastro.senha, ultimoCadastro.senhaHash), true);
});

for (const status of ["AGUARDANDO_ATIVACAO", "BLOQUEADA", "INATIVA"]) {
  test(`conta ${status} não pode entrar`, async () => {
    usuario!.status = status;
    const res = await requisicao("POST", "/usuarios/login", undefined, { email: "teste@example.com", senha: "SenhaForte123!" });
    assert.equal(res.status, 403);
    assert.equal("token" in await res.json(), false);
  });
  test(`JWT anterior não permite acesso com conta ${status}`, async () => {
    usuario!.status = status;
    const res = await requisicao("GET", "/usuarios", token());
    assert.equal(res.status, 403);
    assert.equal(consultas, 0);
  });
}

test("conta ativa recebe JWT no login", async () => {
  const res = await requisicao("POST", "/usuarios/login", undefined, { email: "teste@example.com", senha: "SenhaForte123!" });
  assert.equal(res.status, 200);
  const body = await res.json() as { token: string };
  const payload = jwt.verify(body.token, process.env.JWT_SECRET!) as jwt.JwtPayload;
  assert.equal(payload.id, id);
});

test("senha incorreta não emite JWT", async () => {
  const res = await requisicao("POST", "/usuarios/login", undefined, { email: "teste@example.com", senha: "incorreta" });
  assert.equal(res.status, 401);
});

test("token expirado é rejeitado antes de listar dados", async () => {
  const res = await requisicao("GET", "/usuarios", token("OPERADOR", -1));
  assert.equal(res.status, 401);
  assert.equal(consultas, 0);
});

test("assinatura inválida é rejeitada", async () => {
  const res = await requisicao("GET", "/usuarios", jwt.sign({ id }, "outro-segredo"));
  assert.equal(res.status, 401);
  assert.equal(consultas, 0);
});

test("conta removida não mantém acesso pelo JWT", async () => {
  usuario = null;
  const res = await requisicao("GET", "/usuarios", token());
  assert.equal(res.status, 401);
  assert.equal(consultas, 0);
});

test("listagem paginada não consulta CPF, e-mail, telefone ou hash", async () => {
  const res = await requisicao("GET", "/api/v1/usuarios?pagina=2&limite=2&perfil=ESTUDANTE", token());
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.dados.length, 2);
  assert.deepEqual(body.meta, { pagina: 2, limite: 2, temProxima: true });
  assert.equal(ultimaConsulta.skip, 2);
  assert.equal(ultimaConsulta.take, 3);
  assert.equal(ultimaConsulta.where.perfil, "ESTUDANTE");
  for (const campo of ["cpf", "email", "telefone", "senhaHash"]) {
    assert.equal(campo in ultimaConsulta.select, false);
    assert.equal(campo in body.dados[0], false);
  }
});

for (const query of ["limite=101", "pagina=0", "limite=abc", "perfil=ADMIN", "cpf=52998224725"]) {
  test(`listagem rejeita filtro inválido: ${query}`, async () => {
    const res = await requisicao("GET", `/api/v1/usuarios?${query}`, token());
    assert.equal(res.status, 400);
    assert.equal(consultas, 0);
  });
}

test("cadastro não devolve documento nem hash", async () => {
  const res = await requisicao("POST", "/api/v1/usuarios", token(), cadastro);
  assert.equal(res.status, 201);
  const body = await res.json() as any;
  assert.equal("cpf" in body, false);
  assert.equal("senhaHash" in body, false);
});

for (const cpf of ["00000000000", "52998224724", "abc52998224725"]) {
  test(`cadastro rejeita CPF inválido (${cpf.slice(-2)})`, async () => {
    const res = await requisicao("POST", "/usuarios", token(), { ...cadastro, cpf });
    assert.equal(res.status, 400);
    assert.equal(cadastros, 0);
    assert.equal((await res.text()).includes(cpf), false);
  });
}

test("cadastro normaliza CPF, e-mail e telefone", async () => {
  const res = await requisicao("POST", "/usuarios", token(), {
    ...cadastro, cpf: "529.982.247-25", email: " NOVO@EXAMPLE.COM ", telefone: "(53) 99123-4567",
  });
  assert.equal(res.status, 201);
  assert.equal(ultimoCadastro.cpf, cadastro.cpf);
  assert.equal(ultimoCadastro.email, cadastro.email);
  assert.equal(ultimoCadastro.telefone, cadastro.telefone);
});

test("restrição única concorrente retorna 409 sem detalhes pessoais", async () => {
  erroCadastro = { code: "P2002", meta: { target: ["cpf"] }, message: cadastro.cpf };
  const res = await requisicao("POST", "/usuarios", token(), cadastro);
  assert.equal(res.status, 409);
  assert.equal((await res.text()).includes(cadastro.cpf), false);
});

test("estudante consulta somente o próprio perfil sem CPF", async () => {
  usuario!.perfil = "ESTUDANTE";
  const res = await requisicao("GET", "/api/v1/usuarios/me", token());
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.id, id);
  assert.equal("cpf" in body, false);
  assert.equal("senhaHash" in body, false);
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("estudante não consulta outro usuário", async () => {
  usuario!.perfil = "ESTUDANTE";
  const res = await requisicao("GET", "/api/v1/usuarios/00000000-0000-4000-8000-000000000002", token());
  assert.equal(res.status, 403);
});

test("estudante altera somente nome e telefone próprios", async () => {
  usuario!.perfil = "ESTUDANTE";
  const res = await requisicao("PATCH", "/api/v1/usuarios/me", token(), { nome: "Nome atualizado" });
  assert.equal(res.status, 200);
  assert.equal(ultimaAtualizacao.where.id, id);
  assert.deepEqual(ultimaAtualizacao.data, { nome: "Nome atualizado" });
});

for (const body of [{ perfil: "OPERADOR" }, { status: "ATIVA" }, { cpf: cadastro.cpf }, { email: "outro@example.com" }, {}]) {
  test(`edição rejeita campos proibidos ou vazios: ${Object.keys(body).join()}`, async () => {
    const res = await requisicao("PATCH", "/api/v1/usuarios/me", token(), body);
    assert.equal(res.status, 400);
    assert.equal(ultimaAtualizacao, undefined);
  });
}

test("operador pode desativar outra conta preservando o registro", async () => {
  const outroId = "00000000-0000-4000-8000-000000000002";
  const res = await requisicao("PATCH", `/api/v1/usuarios/${outroId}/status`, token(), { status: "INATIVA", motivo: "Desativação administrativa" });
  assert.equal(res.status, 200);
  assert.deepEqual(ultimaAtualizacao.data, { status: "INATIVA" });
  assert.equal(ultimaAtualizacao.where.id, outroId);
});

test("operador não pode alterar o próprio status", async () => {
  const res = await requisicao("PATCH", `/api/v1/usuarios/${id}/status`, token(), { status: "INATIVA", motivo: "Desativação administrativa" });
  assert.equal(res.status, 409);
  assert.equal(ultimaAtualizacao, undefined);
});

test("identificador inválido retorna 400", async () => {
  assert.equal((await requisicao("GET", "/api/v1/usuarios/abc", token())).status, 400);
});

test("login novo emite JWT sem dados pessoais", async () => {
  const res = await requisicao("POST", "/api/v1/auth/login", undefined, { email: "teste@example.com", senha: "SenhaForte123!" });
  assert.equal(res.status, 200);
  const body = await res.json() as { token: string };
  const payload = jwt.verify(body.token, process.env.JWT_SECRET!) as jwt.JwtPayload;
  for (const campo of ["cpf", "email", "nome", "perfil"]) assert.equal(campo in payload, false);
});

test("rota inexistente retorna JSON 404", async () => {
  const res = await requisicao("GET", "/nao-existe");
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { erro: "Rota não encontrada" });
});
