import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { criarAvisoSchema, editarAvisoSchema } from "../src/modules/avisos/avisos.schemas";

process.env.JWT_SECRET = "segredo-exclusivo-dos-testes-sem-uso-real";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.MAILTRAP_USER = "test";
process.env.MAILTRAP_PASS = "test";
process.env.SMTP_FROM = "test@example.com";

const id = "00000000-0000-4000-8000-000000000001";
let prisma: typeof import("../lib/prisma").prisma;
let server: Server;
let base: string;
let perfil: string;
let aviso: any;
let consultas: any[];
const restaurar: Array<() => void> = [];

// Simula o contrato dos filtros; a migração é verificada separadamente em PGlite.
function corresponde(registro: any, where: any): boolean {
  return Object.entries(where).every(([campo, valor]: [string, any]) => {
    if (valor === undefined) return true;
    if (campo === "AND") return valor.every((v: any) => corresponde(registro, v));
    if (campo === "OR") return valor.some((v: any) => corresponde(registro, v));
    if (valor && typeof valor === "object") {
      if (registro[campo] === null) return false;
      if (valor.gt) return registro[campo] > valor.gt;
      if (valor.lte) return registro[campo] <= valor.lte;
    }
    return registro[campo] === valor;
  });
}

before(async () => {
  prisma = (await import("../lib/prisma")).prisma;
  function substituir(alvo: any, chave: string, fn: any) {
    const original = alvo[chave]; alvo[chave] = fn;
    restaurar.push(() => { alvo[chave] = original; });
  }
  substituir(prisma.usuario, "findUnique", async () => ({ id, email: "teste@example.com", perfil, status: "ATIVA" }));
  substituir(prisma.aviso, "findFirst", async (args: any) => {
    consultas.push(args); return aviso && corresponde(aviso, args.where) ? aviso : null;
  });
  substituir(prisma.aviso, "findUnique", async () => aviso);
  substituir(prisma.aviso, "findMany", async (args: any) => {
    consultas.push(args); return aviso && corresponde(aviso, args.where) ? [aviso] : [];
  });
  substituir(prisma.aviso, "create", async (args: any) => { aviso = { ...aviso, ...args.data }; return aviso; });
  substituir(prisma.aviso, "update", async (args: any) => {
    for (const [campo, valor] of Object.entries(args.data)) if (valor !== undefined) aviso[campo] = valor;
    return aviso;
  });
  substituir(prisma, "$transaction", async (fn: any) => fn(prisma));
  substituir(prisma.alteracaoAviso, "create", async (args: any) => args.data);
  const app = (await import("../src/app")).default;
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/avisos`;
});
beforeEach(() => {
  perfil = "ESTUDANTE"; consultas = [];
  aviso = { id, titulo: "Aviso de teste", mensagem: "Mensagem", ativo: true, importante: false,
    categoria: "GERAL", publicoPerfil: "ESTUDANTE", expiraEm: new Date(Date.now() + 3600000),
    publicadoEm: new Date(Date.now() - 3600000) };
});
after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  restaurar.reverse().forEach((fn) => fn()); await prisma?.$disconnect();
});
async function request(method: string, path = "", body?: unknown, autenticado = true) {
  return fetch(base + path, { method, headers: { "Content-Type": "application/json",
    ...(autenticado ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET!)}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
}

test("edição parcial não injeta público nem expiração", () => {
  assert.deepEqual(editarAvisoSchema.parse({ titulo: "Novo título", motivo: "Correção" }), { titulo: "Novo título", motivo: "Correção" });
  assert.equal(editarAvisoSchema.safeParse({}).success, false);
});
test("criação e edição rejeitam expiração passada", () => {
  assert.equal(criarAvisoSchema.safeParse({ titulo: "Título", mensagem: "Texto", expiraEm: "2020-01-01T00:00:00Z" }).success, false);
  assert.equal(editarAvisoSchema.safeParse({ expiraEm: "2020-01-01T00:00:00Z" }).success, false);
  assert.equal(editarAvisoSchema.safeParse({ expiraEm: null, motivo: "Correção" }).success, true);
});
test("consulta exige autenticação", async () => {
  assert.equal((await request("GET", "", undefined, false)).status, 401);
  assert.equal(consultas.length, 0);
});
for (const caso of ["outro perfil", "arquivado", "expirado", "publicação futura"]) {
  test(`listagem e consulta individual ocultam aviso: ${caso}`, async () => {
    if (caso === "outro perfil") aviso.publicoPerfil = "OPERADOR";
    if (caso === "arquivado") aviso.ativo = false;
    if (caso === "expirado") aviso.expiraEm = new Date(Date.now() - 1000);
    if (caso === "publicação futura") aviso.publicadoEm = new Date(Date.now() + 3600000);
    const lista = await request("GET");
    assert.deepEqual((await lista.json() as any).dados, []);
    assert.equal((await request("GET", `/${id}`)).status, 404);
  });
}
test("avisos gerais e do próprio perfil são visíveis", async () => {
  assert.equal((await request("GET", `/${id}`)).status, 200);
  aviso.publicoPerfil = null; aviso.expiraEm = null;
  assert.equal((await request("GET", `/${id}`)).status, 200);
  const lista = await request("GET", "?limite=1&importante=false&categoria=GERAL");
  assert.equal((await lista.json() as any).dados.length, 1);
  assert.equal(consultas.at(-1).take, 2);
  assert.deepEqual(consultas.at(-1).select.publicadoPor, { select: { id: true, nome: true } });
});
for (const perfilNegado of ["ESTUDANTE", "MOTORISTA"]) {
  test(`${perfilNegado} não acessa gestão nem modifica avisos`, async () => {
    perfil = perfilNegado;
    for (const [metodo, caminho, corpo] of [
      ["GET", "/gestao", undefined], ["GET", `/gestao/${id}`, undefined],
      ["POST", "", { titulo: "Título", mensagem: "Texto" }],
      ["PATCH", `/${id}`, { titulo: "Novo título", motivo: "Correção" }],
      ["PATCH", `/${id}/status`, { ativo: false, motivo: "Arquivamento" }],
    ] as const) assert.equal((await request(metodo, caminho, corpo)).status, 403);
  });
}
test("operador consulta arquivados e expirados na gestão", async () => {
  perfil = "OPERADOR"; aviso.ativo = false; aviso.expiraEm = new Date(0);
  assert.equal((await request("GET", `/${id}`)).status, 404);
  assert.equal((await request("GET", `/gestao/${id}`)).status, 200);
  assert.equal((await (await request("GET", "/gestao")).json() as any).dados.length, 1);
});
test("operador edita título preservando público e expiração", async () => {
  perfil = "OPERADOR";
  const expira = aviso.expiraEm.toISOString();
  const res = await request("PATCH", `/${id}`, { titulo: "Título novo", motivo: "Correção" });
  assert.equal(res.status, 200);
  const dados = await res.json() as any;
  assert.equal(dados.publicoPerfil, "ESTUDANTE"); assert.equal(dados.expiraEm, expira);
  assert.equal((await request("PATCH", `/${id}`, {})).status, 400);
});
test("operador cria e arquiva aviso", async () => {
  perfil = "OPERADOR";
  assert.equal((await request("POST", "", { titulo: "Novo aviso", mensagem: "Mensagem" })).status, 201);
  assert.equal(aviso.publicadoPorId, id);
  assert.equal((await request("PATCH", `/${id}/status`, { ativo: false, motivo: "Arquivamento" })).status, 200);
  assert.equal(aviso.ativo, false);
});
test("parâmetros inválidos retornam 400 e aviso ausente retorna 404", async () => {
  assert.equal((await request("GET", "/abc")).status, 400);
  assert.equal((await request("GET", "?limite=101")).status, 400);
  aviso = null;
  assert.equal((await request("GET", `/${id}`)).status, 404);
});
