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
const restaurar: Array<() => void> = [];

function substituirMetodo(nome: "findUnique" | "findFirst" | "findMany" | "create", substituto: (...args: any[]) => Promise<any>) {
  const original = prisma.usuario[nome];
  Object.assign(prisma.usuario, { [nome]: substituto });
  restaurar.push(() => Object.assign(prisma.usuario, { [nome]: original }));
}

before(async () => {
  prisma = (await import("../lib/prisma")).prisma;
  const app = (await import("../src/app")).default;
  senhaHash = await bcrypt.hash("SenhaForte123!", 4);
  substituirMetodo("findUnique", async () => usuario);
  substituirMetodo("findFirst", async () => null);
  substituirMetodo("findMany", async () => { consultas++; return []; });
  substituirMetodo("create", async (args: any) => {
    cadastros++;
    ultimoCadastro = args.data;
    return { id, perfil: args.data.perfil, status: "AGUARDANDO_ATIVACAO" };
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(() => {
  usuario = { id, nome: "Teste", email: "teste@example.com", perfil: "OPERADOR", status: "ATIVA", senhaHash };
  consultas = 0;
  cadastros = 0;
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

const cadastro = { nome: "Teste", cpf: "00000000000", email: "novo@example.com", telefone: "000000000", senha: "SenhaForte123!", perfil: "OPERADOR" };

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
