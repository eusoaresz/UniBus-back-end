import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import Stripe from "stripe";
import { PGlite } from "@electric-sql/pglite";
import { PrismaClient } from "../generated/prisma";
import { adapterMemoria } from "./helpers/postgres-memoria";

process.env.JWT_SECRET = "segredo-exclusivo-dos-testes-sem-uso-real";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.NODE_ENV = "test";
process.env.MAILTRAP_USER = "test"; process.env.MAILTRAP_PASS = "test"; process.env.SMTP_FROM = "test@example.com";
process.env.STRIPE_SECRET_KEY = "sk_test_ficticia";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_ficticio";
const db = new PGlite(), prisma = new PrismaClient({ adapter: adapterMemoria(db) });
const sdk = new Stripe("sk_test_ficticia");
let server: Server, base: string, unidade: string, operador: string, contador = 0;
let aluno: { usuarioId: string; carteira: { id: string } | null };
let pagamentos: typeof import("../src/modules/carteira/pix");
let gateway: typeof import("../src/modules/carteira/stripe");
let criacoes = 0;
const intents = new Map<string, Stripe.PaymentIntent>();
const chaves = new Map<string, string>();

async function criarAluno() {
  const i = ++contador;
  return prisma.estudante.create({ data: { matricula: `M${i}`, unidadeEnsino: { connect: { id: unidade } }, previsaoConclusao: new Date("2030-12-31"), statusCadastro: "APROVADO",
    usuario: { create: { nome: "Aluno", cpf: String(i).padStart(11, "0"), email: `${i}@example.com`, telefone: "53999999999", perfil: "ESTUDANTE" as const, status: "ATIVA" as const } },
    carteira: { create: {} } }, include: { carteira: true } });
}
async function api(method: string, path: string, body?: unknown, usuarioId: string | null = aluno.usuarioId) {
  const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json",
    ...(usuarioId ? { Authorization: `Bearer ${jwt.sign({ id: usuarioId }, process.env.JWT_SECRET!, { expiresIn: "1h" })}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json() as any };
}
async function solicitar(valor = "10.25", chave = randomUUID()) {
  const r = await api("POST", "/carteira/pix", { valor, chaveIdempotencia: chave });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}
async function intent(recargaId: string) {
  const p = await prisma.pagamento.findUniqueOrThrow({ where: { recargaId } });
  return intents.get(p.referencia!)!;
}
function pago(p: Stripe.PaymentIntent) {
  p.status = "succeeded"; p.amount_received = p.amount;
  p.latest_charge = { id: `ch_${p.id}`, object: "charge", paid: true, refunded: false, amount_refunded: 0, disputed: false,
    amount: p.amount, currency: "brl" } as Stripe.Charge;
  return p;
}
async function webhook(p: Stripe.PaymentIntent, tipo = "payment_intent.succeeded", assinaturaValida = true) {
  const corpo = JSON.stringify({ id: `evt_${randomUUID()}`, object: "event", type: tipo, livemode: p.livemode, data: { object: { id: p.id } } });
  const assinatura = sdk.webhooks.generateTestHeaderString({ payload: corpo, secret: assinaturaValida ? process.env.STRIPE_WEBHOOK_SECRET! : "errado" });
  const r = await fetch(base + "/pagamentos/stripe", { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": assinatura }, body: corpo });
  return { status: r.status, body: await r.json() as any };
}
before(async () => {
  for (const pasta of readdirSync("prisma/migrations").filter(p => /^\d/.test(p)).sort()) await db.exec(readFileSync(`prisma/migrations/${pasta}/migration.sql`, "utf8"));
  (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
  operador = (await prisma.usuario.create({ data: { nome: "Operador", cpf: "99999999999", email: "op@example.com", telefone: "53999999999", perfil: "OPERADOR", status: "ATIVA" } })).id;
  const ponto = await prisma.pontoParada.create({ data: { nome: "Campus", cidade: "Pelotas" } });
  unidade = (await prisma.unidadeEnsino.create({ data: { nome: "Campus", pontoParada: { connect: { id: ponto.id } },
    instituicaoEnsino: { create: { nome: "Instituição", tipo: "FACULDADE" as const } } } })).id;
  pagamentos = await import("../src/modules/carteira/pix");
  gateway = await import("../src/modules/carteira/stripe");
  const app = (await import("../src/app")).default;
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});
beforeEach(async ctx => {
  if (!("mock" in ctx)) throw new Error("Contexto de teste necessário");
  process.env.PAGAMENTOS_ATIVOS = "true";
  process.env.STRIPE_AMBIENTE = "teste";
  aluno = await criarAluno(); criacoes = 0;
  ctx.mock.method(gateway.stripe, "criar", async (amount: number, recargaId: string, chaveCriacao: string) => {
    criacoes++;
    if (chaves.has(chaveCriacao)) return structuredClone(intents.get(chaves.get(chaveCriacao)!)!);
    const id = `pi_${randomUUID()}`;
    const p = { id, object: "payment_intent", amount, amount_received: 0, currency: "brl", livemode: false,
      metadata: { recargaId, chaveCriacao }, status: "requires_payment_method", payment_method_types: ["pix"],
      client_secret: `${id}_secret_ficticio`, latest_charge: null } as unknown as Stripe.PaymentIntent;
    chaves.set(chaveCriacao, id); intents.set(id, p);
    return structuredClone(p);
  });
  ctx.mock.method(gateway.stripe, "consultar", async (id: string) => {
    const p = intents.get(id); if (!p) throw new Error("Pagamento inexistente");
    return structuredClone(p);
  });
});
after(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect(); await db.close(); });

test("criação Pix é própria, idempotente e não credita antes do pagamento", async () => {
  const chave = randomUUID(), r = await solicitar("10.25", chave);
  assert.equal(r.status, "PENDENTE"); assert.ok(r.segredoCliente);
  assert.equal((await solicitar("10.25", chave)).id, r.id); assert.equal(criacoes, 1);
  assert.equal((await api("POST", "/carteira/pix", { valor: "20.00", chaveIdempotencia: chave })).status, 409);
  assert.equal((await prisma.carteira.findUniqueOrThrow({ where: { id: aluno.carteira!.id } })).saldo.toFixed(2), "0.00");
  const outro = await criarAluno();
  assert.equal((await api("GET", `/carteira/pix/${r.id}`, undefined, outro.usuarioId)).status, 404);
  assert.equal((await api("GET", `/carteira/pix/${r.id}`, undefined, operador)).status, 403);
  await prisma.estudante.update({ where: { usuarioId: aluno.usuarioId }, data: { statusCadastro: "REJEITADO" } });
  assert.equal((await api("GET", `/carteira/pix/${r.id}`)).status, 403);
  await prisma.estudante.update({ where: { usuarioId: aluno.usuarioId }, data: { statusCadastro: "APROVADO" } });
  assert.equal((await api("POST", "/carteira/pix", { valor: "10.00", chaveIdempotencia: randomUUID() }, null)).status, 401);
  process.env.PAGAMENTOS_ATIVOS = "false";
  assert.equal((await api("POST", "/carteira/pix", { valor: "10.00", chaveIdempotencia: randomUUID() })).status, 503);
});

test("webhook assinado consulta Stripe e credita uma única vez com histórico e notificação", async () => {
  const r = await solicitar(), p = pago(await intent(r.id));
  assert.equal((await webhook(p, undefined, false)).status, 400);
  const respostas = await Promise.all([webhook(p), webhook(p)]);
  assert.ok(respostas.every(r => r.status === 200));
  assert.equal((await webhook(p)).status, 200);
  const saldo = await prisma.carteira.findUniqueOrThrow({ where: { id: aluno.carteira!.id } });
  assert.equal(saldo.saldo.toFixed(2), "10.25");
  const movimentos = await prisma.movimentacaoCarteira.findMany({ where: { recargaId: r.id } });
  assert.equal(movimentos.length, 1); assert.equal(movimentos[0].realizadaPorId, null);
  assert.equal(await prisma.notificacao.count({ where: { chaveDeduplicacao: `analise-recarga:${r.id}` } }), 1);
  assert.equal((await api("GET", `/carteira/pix/${r.id}`)).body.segredoCliente, null);
});

test("valor, moeda, vínculo, método e ambiente divergentes nunca creditam", async () => {
  const r = await solicitar(), original = structuredClone(pago(await intent(r.id)));
  for (const alteracao of [{ currency: "usd" }, { amount: 1024 }, { amount_received: 1 }, { livemode: true },
    { metadata: { ...original.metadata, chaveCriacao: randomUUID() } }, { payment_method_types: ["card"] }, { latest_charge: null }]) {
    intents.set(original.id, { ...structuredClone(original), ...alteracao } as Stripe.PaymentIntent);
    const res = await webhook(intents.get(original.id)!);
    assert.ok([400, 409].includes(res.status), JSON.stringify(res));
  }
  assert.equal(await prisma.movimentacaoCarteira.count({ where: { recargaId: r.id } }), 0);
});

test("aprovação, rejeição e estorno manuais são bloqueados para recargas integradas", async () => {
  const r = await solicitar();
  for (const acao of ["aprovar", "rejeitar", "estornar"]) {
    const dados = { chaveIdempotencia: randomUUID(), ...(acao !== "aprovar" ? { motivo: "Teste de operação" } : {}) };
    assert.equal((await api("POST", `/operador/recargas/${r.id}/${acao}`, dados, operador)).status, 409);
  }
  const manual = await api("POST", "/carteira/recargas", { valor: "5.00", chaveIdempotencia: randomUUID() });
  assert.equal(manual.status, 201);
  assert.equal((await api("POST", `/operador/recargas/${manual.body.id}/aprovar`, { chaveIdempotencia: randomUUID() }, operador)).status, 200);
  const lista = JSON.stringify((await api("GET", "/operador/recargas", undefined, operador)).body);
  assert.equal(lista.includes("segredoCliente"), false); assert.equal(lista.includes("_secret_"), false);
});

test("falha na criação repete a mesma chave; resultado desconhecido antigo não cria nova cobrança", async ctx => {
  const criar = gateway.stripe.criar;
  let falhou = false;
  ctx.mock.method(gateway.stripe, "criar", async (...args: Parameters<typeof criar>) => {
    const p = await criar(...args);
    if (!falhou) { falhou = true; throw new Error("Resposta perdida"); }
    return p;
  });
  const chave = randomUUID(), corpo = { valor: "10.25", chaveIdempotencia: chave };
  assert.equal((await api("POST", "/carteira/pix", corpo)).status, 502);
  const r = await solicitar("10.25", chave);
  assert.equal(await prisma.recarga.count({ where: { carteiraId: aluno.carteira!.id } }), 1);
  assert.equal(criacoes, 2);
  await prisma.pagamento.update({ where: { recargaId: r.id }, data: { referencia: null, criadoEm: new Date(Date.now() - 24 * 3600000) } });
  assert.equal((await api("POST", "/carteira/pix", corpo)).status, 409);
});

test("conciliação recupera webhook ausente; evento atrasado não regride pagamento", async () => {
  const r = await solicitar(), p = pago(await intent(r.id));
  await prisma.pagamento.update({ where: { recargaId: r.id }, data: { proximaConsultaEm: new Date(0) } });
  await pagamentos.conciliarPagamentos();
  assert.equal((await prisma.recarga.findUniqueOrThrow({ where: { id: r.id } })).status, "APROVADA");
  assert.equal((await webhook(p, "payment_intent.payment_failed")).status, 200);
  assert.equal((await prisma.recarga.findUniqueOrThrow({ where: { id: r.id } })).status, "APROVADA");
  assert.equal(await prisma.movimentacaoCarteira.count({ where: { recargaId: r.id } }), 1);
});

test("cancelamento não credita e devolução gera revisão sem estorno fictício", async () => {
  const r = await solicitar(), p = await intent(r.id);
  p.status = "canceled";
  assert.equal((await webhook(p, "payment_intent.canceled")).status, 200);
  assert.equal((await prisma.recarga.findUniqueOrThrow({ where: { id: r.id } })).status, "CANCELADA");
  const outra = await solicitar(), q = pago(await intent(outra.id));
  assert.equal((await webhook(q)).status, 200);
  (q.latest_charge as Stripe.Charge).amount_refunded = q.amount;
  await pagamentos.sincronizarPagamento(structuredClone(q));
  assert.equal((await prisma.pagamento.findUniqueOrThrow({ where: { recargaId: outra.id } })).revisaoNecessaria, true);
  assert.equal(await prisma.movimentacaoCarteira.count({ where: { recargaId: outra.id } }), 1);
  assert.equal(await prisma.notificacao.count({ where: { chaveDeduplicacao: `revisao-pix:${outra.id}:${operador}` } }), 1);
});

test("falha no registro da notificação desfaz crédito e permite repetir webhook", async () => {
  const r = await solicitar(), p = pago(await intent(r.id));
  await db.exec(`CREATE FUNCTION falhar_notificacao_pix() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha teste'; END $$;
    CREATE TRIGGER falhar_notificacao_pix BEFORE INSERT ON "Notificacao" FOR EACH ROW EXECUTE FUNCTION falhar_notificacao_pix();`);
  try {
    assert.equal((await webhook(p)).status, 500);
    assert.equal((await prisma.carteira.findUniqueOrThrow({ where: { id: aluno.carteira!.id } })).saldo.toFixed(2), "0.00");
    assert.equal((await prisma.recarga.findUniqueOrThrow({ where: { id: r.id } })).status, "PENDENTE");
  } finally { await db.exec('DROP TRIGGER falhar_notificacao_pix ON "Notificacao"; DROP FUNCTION falhar_notificacao_pix();'); }
  assert.equal((await webhook(p)).status, 200);
  assert.equal(await prisma.movimentacaoCarteira.count({ where: { recargaId: r.id } }), 1);
});

test("pagamento que excede saldo e devolução anterior ao crédito exigem revisão", async () => {
  const r = await solicitar(), p = pago(await intent(r.id));
  await prisma.carteira.update({ where: { id: aluno.carteira!.id }, data: { saldo: "99999999.99" } });
  assert.equal((await webhook(p)).status, 200);
  assert.equal((await prisma.pagamento.findUniqueOrThrow({ where: { recargaId: r.id } })).motivoRevisao, "LIMITE_SALDO");
  assert.equal(await prisma.movimentacaoCarteira.count({ where: { recargaId: r.id } }), 0);
  const outra = await solicitar(), q = pago(await intent(outra.id));
  (q.latest_charge as Stripe.Charge).refunded = true;
  assert.equal((await webhook(q)).status, 200);
  assert.equal((await prisma.pagamento.findUniqueOrThrow({ where: { recargaId: outra.id } })).motivoRevisao, "DEVOLUCAO_OU_DISPUTA");
  assert.equal(await prisma.movimentacaoCarteira.count({ where: { recargaId: outra.id } }), 0);
});

test("webhook recupera referência perdida antes da resposta de criação", async () => {
  const r = await solicitar(), p = pago(await intent(r.id));
  await prisma.pagamento.update({ where: { recargaId: r.id }, data: { referencia: null } });
  assert.equal((await webhook(p)).status, 200);
  assert.equal((await prisma.pagamento.findUniqueOrThrow({ where: { recargaId: r.id } })).referencia, p.id);
  assert.equal((await prisma.recarga.findUniqueOrThrow({ where: { id: r.id } })).status, "APROVADA");
});
