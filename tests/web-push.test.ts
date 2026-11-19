import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { createECDH, randomBytes, createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import * as webpush from "web-push";
import { PGlite } from "@electric-sql/pglite";
import { PrismaClient } from "../generated/prisma";
import { adapterMemoria } from "./helpers/postgres-memoria";

process.env.JWT_SECRET = "segredo-exclusivo-dos-testes-sem-uso-real";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.NODE_ENV = "test";
process.env.MAILTRAP_USER = "test"; process.env.MAILTRAP_PASS = "test"; process.env.SMTP_FROM = "test@example.com";
const vapid = webpush.generateVAPIDKeys();
process.env.WEB_PUSH_SUBJECT = "mailto:test@example.com";
process.env.WEB_PUSH_PUBLIC_KEY = vapid.publicKey;
process.env.WEB_PUSH_PRIVATE_KEY = vapid.privateKey;
const db = new PGlite(), prisma = new PrismaClient({ adapter: adapterMemoria(db) });
let server: Server, base: string, usuario: string, outro: string, contador = 0;
let service: typeof import("../src/modules/notificacoes/notificacoes.service");
let worker: typeof import("../src/modules/notificacoes/fila");
let auth: typeof import("../src/modules/auth/auth.service");
const token = (id: string) => jwt.sign({ id }, process.env.JWT_SECRET!, { expiresIn: "1h" });
async function api(method: string, path: string, body?: unknown, id: string | null = usuario) {
  const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(id ? { Authorization: `Bearer ${token(id)}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json() as any };
}
function inscricao() {
  const key = createECDH("prime256v1"); key.generateKeys();
  return { endpoint: `https://fcm.googleapis.com/fcm/send/teste-${++contador}`, expirationTime: null,
    keys: { p256dh: key.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
}
async function registrar(chave = `evento:${++contador}`, avisoId?: string) {
  return prisma.$transaction(tx => service.registrarNotificacao(tx, { usuarioId: usuario, chaveDeduplicacao: chave,
    tema: "OPERACAO", tipo: "TESTE", titulo: "Informação privada", mensagem: "Conteúdo privado", avisoId }));
}
before(async () => {
  for (const pasta of readdirSync("prisma/migrations").filter(p => /^\d/.test(p)).sort()) await db.exec(readFileSync(`prisma/migrations/${pasta}/migration.sql`, "utf8"));
  (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
  service = await import("../src/modules/notificacoes/notificacoes.service");
  worker = await import("../src/modules/notificacoes/fila");
  auth = await import("../src/modules/auth/auth.service");
  const app = (await import("../src/app")).default;
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/notificacoes`;
});
beforeEach(async () => {
  process.env.WEB_PUSH_ENABLED = "true";
  await prisma.entregaNotificacao.updateMany({ data: { status: "CANCELADA" } });
  for (const perfil of ["ESTUDANTE", "MOTORISTA"] as const) {
    const i = ++contador;
    const u = await prisma.usuario.create({ data: { nome: "Teste", cpf: String(i).padStart(11, "0"), email: `${i}@example.com`, telefone: "53999999999", perfil, status: "ATIVA" } });
    if (perfil === "ESTUDANTE") usuario = u.id; else outro = u.id;
  }
});
after(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect(); await db.close(); });

test("Web Push exige autenticação, configuração e inscrição válida sem revelar segredos", async () => {
  assert.equal((await api("GET", "/push/configuracao", undefined, null)).status, 401);
  const config = (await api("GET", "/push/configuracao")).body;
  assert.deepEqual(config, { habilitado: true, chavePublica: vapid.publicKey });
  process.env.WEB_PUSH_ENABLED = "false";
  assert.equal((await api("GET", "/push/configuracao")).body.habilitado, false);
  assert.equal((await api("POST", "/push/inscricoes", inscricao())).status, 503);
  process.env.WEB_PUSH_ENABLED = "true";
  const dados = inscricao();
  for (const endpoint of ["http://fcm.googleapis.com/x", "https://127.0.0.1/x", "https://fcm.googleapis.com.evil.example/x", "https://user:pass@fcm.googleapis.com/x", "https://fcm.googleapis.com:444/x"]) {
    assert.equal((await api("POST", "/push/inscricoes", { ...dados, endpoint })).status, 400);
  }
  assert.equal((await api("POST", "/push/inscricoes", { ...dados, usuarioId: outro })).status, 400);
  assert.equal((await api("POST", "/push/inscricoes", { ...dados, keys: { ...dados.keys, p256dh: "invalida" } })).status, 400);
  assert.equal((await api("POST", "/push/inscricoes", { ...dados, expirationTime: 0 })).status, 400);
  const a = await api("POST", "/push/inscricoes", dados);
  assert.equal(a.status, 200);
  assert.equal((await api("POST", "/push/inscricoes", dados)).body.id, a.body.id);
  for (const campo of ["webEndpoint", "webAuth", "sessaoHash", "usuarioId", "expoPushToken"]) assert.equal(campo in a.body, false);
  assert.equal((await api("GET", "/push/inscricoes", undefined, outro)).body.length, 0);
  assert.equal((await api("DELETE", `/push/inscricoes/${a.body.id}`, undefined, outro)).status, 404);
  assert.equal((await api("POST", "/push/inscricoes", dados, outro)).status, 409);
});

test("fila é transacional, não repete eventos nem envia histórico a navegador novo", async () => {
  const antiga = await registrar();
  const d = await api("POST", "/push/inscricoes", inscricao());
  await registrar(antiga.chaveDeduplicacao);
  assert.equal(await prisma.entregaNotificacao.count({ where: { notificacaoId: antiga.id } }), 0);
  await assert.rejects(prisma.$transaction(async tx => {
    await service.registrarNotificacao(tx, { usuarioId: usuario, chaveDeduplicacao: "rollback-push", tema: "OPERACAO", tipo: "TESTE", titulo: "Teste", mensagem: "Teste" });
    throw new Error("rollback");
  }), /rollback/);
  assert.equal(await prisma.notificacao.count({ where: { chaveDeduplicacao: "rollback-push" } }), 0);
  const n = await registrar(); await registrar(n.chaveDeduplicacao);
  assert.equal(await prisma.entregaNotificacao.count({ where: { notificacaoId: n.id } }), 1);
  const payloads: string[] = [];
  const enviar = async (_s: unknown, p: string) => { payloads.push(p); };
  await Promise.all([worker.processarWebPush(new Date(), enviar), worker.processarWebPush(new Date(), enviar)]);
  await worker.processarWebPush(new Date(), enviar);
  assert.equal(payloads.length, 1);
  assert.equal(JSON.parse(payloads[0]).notificacaoId, n.id);
  assert.equal(payloads[0].includes("privad"), false);
  assert.equal((await prisma.entregaNotificacao.findFirstOrThrow({ where: { dispositivoId: d.body.id } })).status, "ENVIADA");
});

test("preferências, leitura e conta bloqueada são revalidadas antes do envio", async () => {
  await api("POST", "/push/inscricoes", inscricao());
  await registrar();
  await service.atualizarPreferencias(usuario, { operacao: false });
  const semEnvio = async () => { assert.fail("Não deve enviar"); };
  await worker.processarWebPush(new Date(), semEnvio);
  await service.atualizarPreferencias(usuario, { operacao: true });
  await worker.processarWebPush(new Date(), semEnvio);
  const lida = await registrar(); await service.marcarLida(usuario, lida.id);
  await worker.processarWebPush(new Date(), semEnvio);
  await registrar(); await prisma.usuario.update({ where: { id: usuario }, data: { status: "BLOQUEADA" } });
  await worker.processarWebPush(new Date(), semEnvio);
  assert.equal(await prisma.entregaNotificacao.count({ where: { notificacao: { usuarioId: usuario }, status: { not: "CANCELADA" } } }), 0);
});

test("falha transitória tenta novamente; 410 desativa inscrição e cancela fila", async () => {
  const d = await api("POST", "/push/inscricoes", inscricao());
  const n = await registrar(), agora = new Date();
  let chamadas = 0;
  await worker.processarWebPush(agora, async () => { chamadas++; throw { statusCode: 503, body: "segredo" }; });
  const e = await prisma.entregaNotificacao.findFirstOrThrow({ where: { notificacaoId: n.id } });
  assert.equal(e.status, "FALHOU"); assert.equal(e.ultimoErro, "HTTP_503");
  await worker.processarWebPush(agora, async () => { chamadas++; });
  assert.equal(chamadas, 1);
  await worker.processarWebPush(new Date(e.proximaTentativaEm!.getTime() + 1), async () => { chamadas++; });
  assert.equal(chamadas, 2);
  await registrar(); await registrar();
  await worker.processarWebPush(new Date(), async () => { throw { statusCode: 410 }; });
  assert.equal((await prisma.dispositivoUsuario.findUniqueOrThrow({ where: { id: d.body.id } })).ativo, false);
  assert.equal(await prisma.entregaNotificacao.count({ where: { dispositivoId: d.body.id, status: "PENDENTE" } }), 0);
});

test("logout remove apenas inscrições da sessão; remoção é própria e idempotente", async () => {
  const { registrarNavegador } = await import("../src/modules/notificacoes/dispositivos");
  const sessao = createHash("sha256").update("sessao-teste").digest("hex");
  const a = await registrarNavegador(usuario, sessao, inscricao());
  const b = await registrarNavegador(usuario, "outra-sessao", inscricao());
  await registrar();
  await auth.logout(usuario, sessao, new Date(Date.now() + 3600000));
  assert.equal((await prisma.dispositivoUsuario.findUniqueOrThrow({ where: { id: a.id } })).ativo, false);
  assert.equal((await prisma.dispositivoUsuario.findUniqueOrThrow({ where: { id: b.id } })).ativo, true);
  assert.equal((await prisma.entregaNotificacao.findFirstOrThrow({ where: { dispositivoId: a.id } })).status, "CANCELADA");
  for (let i = 0; i < 2; i++) assert.equal((await api("DELETE", `/push/inscricoes/${b.id}`)).status, 200);
  await worker.processarWebPush(new Date(), async () => assert.fail("Inscrições removidas"));
});

test("lease interrompido é retomado; expiração e erro permanente não repetem envio", async () => {
  await api("POST", "/push/inscricoes", inscricao());
  const n = await registrar();
  const e = await prisma.entregaNotificacao.findFirstOrThrow({ where: { notificacaoId: n.id } });
  const agora = new Date();
  await prisma.entregaNotificacao.update({ where: { id: e.id }, data: { status: "PROCESSANDO", tentativas: 1, processandoDesdeEm: new Date(agora.getTime() - 360000) } });
  let chamadas = 0;
  await worker.processarWebPush(agora, async () => { chamadas++; throw { statusCode: 403 }; });
  assert.equal(chamadas, 1);
  await worker.processarWebPush(new Date(agora.getTime() + 600000), async () => assert.fail("Falha permanente"));
  const antiga = await registrar();
  await prisma.notificacao.update({ where: { id: antiga.id }, data: { criadoEm: new Date(agora.getTime() - 3600001) } });
  await worker.processarWebPush(new Date(), async () => assert.fail("Notificação vencida"));
});

test("limite de navegadores, rotação de chaves e reativação preservam isolamento da fila", async () => {
  const dados = inscricao();
  const d = await api("POST", "/push/inscricoes", dados);
  const n = await registrar();
  const novasChaves = inscricao().keys;
  assert.equal((await api("POST", "/push/inscricoes", { ...dados, keys: novasChaves })).body.id, d.body.id);
  assert.equal((await prisma.entregaNotificacao.findFirstOrThrow({ where: { notificacaoId: n.id } })).status, "CANCELADA");
  for (let i = 1; i < 10; i++) assert.equal((await api("POST", "/push/inscricoes", inscricao())).status, 200);
  assert.equal((await api("POST", "/push/inscricoes", inscricao())).status, 409);
  assert.equal((await api("POST", "/push/inscricoes", { ...dados, keys: novasChaves })).status, 200);
  await api("DELETE", `/push/inscricoes/${d.body.id}`);
  assert.equal((await api("POST", "/push/inscricoes", { ...dados, keys: novasChaves })).status, 200);
  await worker.processarWebPush(new Date(), async () => assert.fail("Não reativar entregas antigas"));
});

test("aviso arquivado e inscrição expirada cancelam envio mesmo após enfileirar", async () => {
  const d = await api("POST", "/push/inscricoes", inscricao());
  const aviso = await prisma.aviso.create({ data: { titulo: "Aviso", mensagem: "Teste", publicadoPorId: outro } });
  const n = await registrar(undefined, aviso.id);
  await prisma.aviso.update({ where: { id: aviso.id }, data: { ativo: false } });
  await worker.processarWebPush(new Date(), async () => assert.fail("Aviso arquivado"));
  assert.equal((await prisma.entregaNotificacao.findFirstOrThrow({ where: { notificacaoId: n.id } })).status, "CANCELADA");
  await registrar();
  await prisma.dispositivoUsuario.update({ where: { id: d.body.id }, data: { expiraEm: new Date(0) } });
  await worker.processarWebPush(new Date(), async () => assert.fail("Inscrição expirada"));
});

test("desligado não envia; tentativas são limitadas inclusive após interrupção final", async () => {
  await api("POST", "/push/inscricoes", inscricao());
  const n = await registrar();
  process.env.WEB_PUSH_ENABLED = "false";
  await worker.processarWebPush(new Date(), async () => assert.fail("Envio desligado"));
  process.env.WEB_PUSH_ENABLED = "true";
  let chamadas = 0;
  const agora = Date.now();
  for (const minutos of [0, 2, 5, 10, 20, 30]) {
    await worker.processarWebPush(new Date(agora + minutos * 60000), async () => { chamadas++; throw { statusCode: 429 }; });
  }
  assert.equal(chamadas, 5);
  const e = await prisma.entregaNotificacao.findFirstOrThrow({ where: { notificacaoId: n.id } });
  assert.equal(e.proximaTentativaEm, null);
  await prisma.entregaNotificacao.update({ where: { id: e.id }, data: { status: "PROCESSANDO", processandoDesdeEm: new Date(agora - 360000) } });
  await worker.processarWebPush(new Date(agora), async () => assert.fail("Limite de tentativas"));
  assert.equal((await prisma.entregaNotificacao.findUniqueOrThrow({ where: { id: e.id } })).status, "FALHOU");
});

test("lote revalida expiração com o tempo decorrido durante os envios", async ctx => {
  const dados = inscricao();
  await api("POST", "/push/inscricoes", { ...dados, expirationTime: Date.now() + 30000 });
  await registrar(); await registrar();
  const agora = Date.now();
  ctx.mock.timers.enable({ apis: ["Date"], now: agora });
  let chamadas = 0;
  await worker.processarWebPush(new Date(agora), async () => {
    chamadas++;
    ctx.mock.timers.setTime(agora + 60000);
  });
  assert.equal(chamadas, 1);
  assert.equal(await prisma.entregaNotificacao.count({ where: { notificacao: { usuarioId: usuario }, status: "CANCELADA" } }), 1);
});
