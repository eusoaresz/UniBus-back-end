import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = "segredo-exclusivo-dos-testes-sem-uso-real";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.MAILTRAP_USER = "test";
process.env.MAILTRAP_PASS = "test";
process.env.SMTP_FROM = "test@example.com";
const id = "00000000-0000-4000-8000-000000000001";
const dados = { diaSemana: "SEGUNDA", turno: "MANHA", rotaId: id, motoristaId: id, veiculoId: id,
  saidaIdaMinuto: 420, saidaVoltaMinuto: 720, chegadaPedroMinuto: 800 };
let server: Server, base: string, perfil: string, status: string, ativa: boolean, encontrado: boolean;
let escritas: number, erro: string | undefined, ultimo: any;
const restaurar: (() => void)[] = [];
before(async () => {
  const prisma = (await import("../lib/prisma")).prisma;
  function mock(obj: any, key: string, fn: any) { const anterior = obj[key]; obj[key] = fn; restaurar.push(() => { obj[key] = anterior; }); }
  mock(prisma, "$transaction", async (fn: any) => fn(prisma));
  mock(prisma.usuario, "findUnique", async () => ({ id, perfil, status, email: "op@example.com" }));
  mock(prisma.tokenRevogado, "findUnique", async () => null);
  mock(prisma.rota, "findUnique", async () => encontrado ? { id, ativa } : null);
  mock(prisma.motorista, "findUnique", async () => ({ id, usuario: { perfil: "MOTORISTA", status: "ATIVA" } }));
  mock(prisma.veiculo, "findUnique", async () => ({ id, ativo: true }));
  mock(prisma.escalaSemanal, "findMany", async (args: any) => { ultimo = args; return Array.from({ length: args.take }, () => ({ id, ...dados })); });
  mock(prisma.escalaSemanal, "findUnique", async () => encontrado ? { id, ...dados, ativa: true, saidaVoltaDiaOffset: 0, chegadaPedroDiaOffset: 0 } : null);
  for (const key of ["create", "update"]) mock(prisma.escalaSemanal, key, async (args: any) => { escritas++; ultimo = args; if (erro) throw { code: erro }; return { id, ...args.data }; });
  const app = (await import("../src/app")).default;
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/escalas`;
});
beforeEach(() => { perfil = "OPERADOR"; status = "ATIVA"; ativa = true; encontrado = true; escritas = 0; erro = undefined; });
after(async () => { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); restaurar.reverse().forEach(fn => fn()); });
async function request(method: string, path = "", body?: unknown, authenticated = true) {
  const token = jwt.sign({ id }, process.env.JWT_SECRET!, { expiresIn: 3600 });
  return fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
}
test("escalas exigem token, perfil e conta ativos em todos os métodos", async () => {
  for (const [method, path] of [["GET", ""], ["GET", `/${id}`], ["POST", ""], ["PATCH", `/${id}`]]) {
    assert.equal((await request(method, path, method === "POST" ? dados : undefined, false)).status, 401);
    perfil = "ESTUDANTE"; assert.equal((await request(method, path)).status, 403);
    perfil = "OPERADOR"; status = "BLOQUEADA"; assert.equal((await request(method, path)).status, 403); status = "ATIVA";
  }
  assert.equal(escritas, 0);
});
test("cadastro valida vínculos e horários sem criar registro parcial", async () => {
  assert.equal((await request("POST", "", { ...dados, chegadaPedroMinuto: 600 })).status, 400);
  assert.equal(escritas, 0);
  ativa = false; assert.equal((await request("POST", "", dados)).status, 409); assert.equal(escritas, 0);
  encontrado = false; assert.equal((await request("POST", "", dados)).status, 404);
});
test("cadastro e edição parcial preservam os horários e aceitam retorno no dia seguinte", async () => {
  const response = await request("POST", "", { ...dados, saidaVoltaMinuto: 60, chegadaPedroMinuto: 120, saidaVoltaDiaOffset: 1, chegadaPedroDiaOffset: 1 });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).ativa, true);
  assert.equal((await request("PATCH", `/${id}`, { turno: "NOITE" })).status, 200);
  assert.deepEqual(ultimo.data, { turno: "NOITE" });
});
test("UUID, campos extras, paginação e corpo vazio são rejeitados", async () => {
  assert.equal((await request("GET", "/invalido")).status, 400);
  assert.equal((await request("POST", "", { ...dados, campoInterno: true })).status, 400);
  assert.equal((await request("PATCH", `/${id}`, {})).status, 400);
  assert.equal((await request("GET", "?limite=101")).status, 400);
  const response = await request("GET", "?pagina=2&limite=2");
  const body = await response.json(); assert.equal(body.dados.length, 2); assert.equal(body.meta.temProxima, true); assert.equal(ultimo.skip, 2);
});
test("ausência, duplicidade e FK retornam erros controlados", async () => {
  encontrado = false; assert.equal((await request("GET", `/${id}`)).status, 404);
  encontrado = true; erro = "P2002"; assert.equal((await request("POST", "", dados)).status, 409);
  erro = "P2003"; const response = await request("POST", "", dados); assert.equal(response.status, 409);
  assert.equal(JSON.stringify(await response.json()).includes("P2003"), false);
});
