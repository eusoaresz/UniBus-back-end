import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { PGlite } from "@electric-sql/pglite";
import { PrismaClient, Prisma } from "../generated/prisma";
import { adapterMemoria } from "./helpers/postgres-memoria";
import { debitar, estornar, executarTransacao } from "../src/modules/carteira/carteira.financeiro";
import { valorSchema } from "../src/modules/carteira/carteira.schemas";

process.env.JWT_SECRET = "segredo-exclusivo-dos-testes-sem-uso-real";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.NODE_ENV = "test";
const comprovantesDir = mkdtempSync(join(tmpdir(), "unibus-comprovantes-teste-"));
process.env.COMPROVANTES_DIR = comprovantesDir;
process.env.MAILTRAP_USER = "test"; process.env.MAILTRAP_PASS = "test"; process.env.SMTP_FROM = "test@example.com";
const db = new PGlite();
const prisma = new PrismaClient({ adapter: adapterMemoria(db) });
let server: Server;
let base: string;
let operador: string;
let motorista: string;
let unidade: string;
let trecho: string;
let parada: string;
let aluno: { id: string; usuarioId: string; carteira: { id: string } | null };
let contador = 0;

async function criarAluno() {
  contador++;
  return prisma.estudante.create({ data: {
    matricula: `M${contador}`, unidadeEnsino: { connect: { id: unidade } }, previsaoConclusao: new Date("2030-12-31"), statusCadastro: "APROVADO",
    usuario: { create: { nome: `Aluno ${contador}`, cpf: String(contador).padStart(11, "0"), email: `${contador}@example.com`, telefone: "53999999999", perfil: "ESTUDANTE", status: "ATIVA" } },
    carteira: { create: {} },
  }, include: { carteira: true } });
}

before(async () => {
  for (const pasta of readdirSync("prisma/migrations").filter((p) => /^\d/.test(p)).sort()) await db.exec(readFileSync(`prisma/migrations/${pasta}/migration.sql`, "utf8"));
  (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
  operador = (await prisma.usuario.create({ data: { nome: "Operador", cpf: "99999999999", email: "op@example.com", telefone: "53999999999", perfil: "OPERADOR", status: "ATIVA" } })).id;
  motorista = (await prisma.usuario.create({ data: { nome: "Motorista", cpf: "88888888888", email: "mot@example.com", telefone: "53999999999", perfil: "MOTORISTA", status: "ATIVA" } })).id;
  const ponto = await prisma.pontoParada.create({ data: { nome: "Unidade teste", cidade: "Pelotas" } });
  unidade = (await prisma.unidadeEnsino.create({ data: { nome: "Campus", pontoParada: { connect: { id: ponto.id } }, instituicaoEnsino: { create: { nome: "Instituição teste", tipo: "FACULDADE" } } } })).id;
  const viagem = await prisma.viagem.create({ data: { data: new Date("2026-11-02"), turno: "NOITE", nomeRota: "Teste", criadaPor: { connect: { id: operador } }, rota: { create: { nome: "Rota teste" } } } });
  trecho = (await prisma.trechoViagem.create({ data: { viagemId: viagem.id, sentido: "IDA", saidaPrevistaEm: new Date("2026-11-02T21:00:00Z"), chegadaPrevistaEm: new Date("2026-11-02T22:00:00Z"), limiteConfirmacaoEm: new Date("2026-11-02T20:00:00Z"), limiteCancelamentoEm: new Date("2026-11-02T20:00:00Z") } })).id;
  parada = (await prisma.paradaTrecho.create({ data: { trechoId: trecho, pontoParadaId: ponto.id, ordem: 1, nome: "Unidade", cidade: "Pelotas" } })).id;
  const app = (await import("../src/app")).default;
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});

beforeEach(async () => { aluno = await criarAluno(); });
after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
  await prisma.$disconnect(); await db.close();
  for (const nome of readdirSync(comprovantesDir)) unlinkSync(join(comprovantesDir, nome));
  rmdirSync(comprovantesDir);
});

async function api(method: string, path: string, usuarioId: string | null = aluno.usuarioId, body?: unknown) {
  const res = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(usuarioId ? { Authorization: `Bearer ${jwt.sign({ id: usuarioId }, process.env.JWT_SECRET!)}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() as any };
}
async function pix(valor = "10.00", chave = randomUUID()) {
  const res = await api("POST", "/carteira/recargas", aluno.usuarioId, { valor, chaveIdempotencia: chave });
  assert.equal(res.status, 201, JSON.stringify(res.body)); return res.body;
}
const aprovar = (id: string, chave = randomUUID()) => api("POST", `/operador/recargas/${id}/aprovar`, operador, { chaveIdempotencia: chave });
const saldo = async () => (await prisma.carteira.findUniqueOrThrow({ where: { id: aluno.carteira!.id } })).saldo.toFixed(2);
async function participacao() {
  return prisma.participacaoTrecho.create({ data: { estudanteId: aluno.id, trechoId: trecho, origemId: parada, destinoId: parada, status: "CONFIRMADA", cicloConfirmacao: 1, confirmadaEm: new Date() } });
}

test("valores exigem texto decimal exato, mínimo e capacidade do banco", () => {
  for (const valor of [2, "1.99", "-2.00", "2.001", "2,00", "2e3", "NaN", "100000000.00", "02.00"]) assert.equal(valorSchema.safeParse(valor).success, false);
  for (const valor of ["2", "2.1", "2.01", "99999999.99"]) assert.equal(valorSchema.safeParse(valor).success, true);
});

test("saldo e extrato são próprios; operador e motorista não usam rotas de estudante", async () => {
  assert.equal((await api("GET", "/carteira", null)).status, 401);
  for (const id of [operador, motorista]) assert.equal((await api("GET", "/carteira", id)).status, 403);
  assert.equal((await api("GET", "/operador/carteiras")).status, 403);
  assert.equal((await api("GET", "/carteira?estudanteId=outro")).body.estudanteId, aluno.id);
  assert.equal((await api("GET", "/carteira")).body.saldo, "0.00");
  await prisma.estudante.update({ where: { id: aluno.id }, data: { statusCadastro: "SUSPENSO" } });
  assert.equal((await api("GET", "/carteira")).status, 200);
  await pix();
  await prisma.usuario.update({ where: { id: aluno.usuarioId }, data: { status: "BLOQUEADA" } });
  assert.equal((await api("GET", "/carteira")).status, 403);
});

test("Pix pendente não credita e repetição com a mesma chave não cria pedido", async () => {
  const chave = randomUUID(); const r = await pix("10.10", chave);
  assert.equal(await saldo(), "0.00");
  assert.equal((await pix("10.10", chave)).id, r.id);
  assert.equal((await api("POST", "/carteira/recargas", aluno.usuarioId, { valor: "11.00", chaveIdempotencia: chave })).status, 409);
  await pix();
  const lista = await api("GET", "/operador/recargas?status=PENDENTE", operador);
  assert.ok(lista.body.dados.some((x: any) => x.carteiraId === aluno.carteira!.id && x.pendentesDoEstudante === 2));
  assert.equal(r.solicitadaPor.id, aluno.usuarioId);
});

test("aprovação credita uma vez e registra notificação e responsáveis", async () => {
  const r = await pix("10.10"); const chave = randomUUID();
  assert.equal((await aprovar(r.id, chave)).status, 200);
  assert.equal((await aprovar(r.id, chave)).status, 200);
  assert.equal(await saldo(), "10.10");
  const lista = await api("GET", "/carteira/extrato");
  assert.equal(lista.body.dados.length, 1); assert.equal(lista.body.dados[0].valor, "10.10");
  assert.equal((await api("GET", "/carteira/notificacoes")).body.dados.length, 1);
  const res = await aprovar(r.id); assert.equal(res.body.analisadaPor.id, operador);
});

test("rejeição não altera saldo e impede aprovação posterior", async () => {
  const r = await pix();
  assert.equal((await api("POST", `/operador/recargas/${r.id}/rejeitar`, operador, { chaveIdempotencia: randomUUID() })).status, 200);
  assert.equal((await aprovar(r.id)).status, 409);
  assert.equal(await saldo(), "0.00");
  assert.equal((await api("GET", "/carteira/notificacoes")).body.dados.length, 1);
});

test("dinheiro só pelo operador, com crédito e estorno integral idempotentes", async () => {
  const dados = { estudanteId: aluno.id, valor: "5.25", chaveIdempotencia: randomUUID() };
  assert.equal((await api("POST", "/operador/recargas/dinheiro", aluno.usuarioId, dados)).status, 403);
  const r = await api("POST", "/operador/recargas/dinheiro", operador, dados);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  await api("POST", "/operador/recargas/dinheiro", operador, dados);
  assert.equal(await saldo(), "5.25");
  const path = `/operador/recargas/${r.body.id}/estornar`;
  assert.equal((await api("POST", path, operador, { chaveIdempotencia: randomUUID() })).status, 400);
  const original = await api("POST", path, operador, { chaveIdempotencia: randomUUID(), motivo: "Registro indevido" });
  assert.equal(original.status, 200);
  const repetido = await api("POST", path, operador, { chaveIdempotencia: randomUUID(), motivo: "Registro indevido" });
  assert.equal(repetido.body.id, original.body.id); assert.equal(await saldo(), "0.00");
});

test("débito no limite e estorno da cobrança, sem novos efeitos ao repetir", async () => {
  await prisma.carteira.update({ where: { id: aluno.carteira!.id }, data: { saldo: "-18.00" } });
  const p = await participacao();
  const dados = { participacaoId: p.id, cicloConfirmacao: 1, valor: "2.00", chaveIdempotencia: randomUUID(), realizadaPorId: aluno.usuarioId };
  const debito = await executarTransacao(prisma, (tx) => debitar(tx, dados));
  assert.equal(await saldo(), "-20.00");
  assert.equal((await executarTransacao(prisma, (tx) => debitar(tx, dados))).id, debito.id);
  await prisma.participacaoTrecho.update({ where: { id: p.id }, data: { cicloConfirmacao: 2 } });
  await assert.rejects(executarTransacao(prisma, (tx) => debitar(tx, { ...dados, cicloConfirmacao: 2, chaveIdempotencia: randomUUID() })), /Saldo insuficiente/);
  const e = await executarTransacao(prisma, (tx) => estornar(tx, { movimentacaoId: debito.id, chaveIdempotencia: randomUUID(), realizadaPorId: operador, motivo: "Cancelamento" }));
  assert.equal(e.valor.toFixed(2), "2.00"); assert.equal(await saldo(), "-18.00");
});

test("estorno da recarga não ultrapassa limite negativo e falha sem efeitos parciais", async () => {
  const r = await pix("30.00"); await aprovar(r.id);
  await prisma.carteira.update({ where: { id: aluno.carteira!.id }, data: { saldo: "0.00" } });
  const resultado = await api("POST", `/operador/recargas/${r.id}/estornar`, operador, { motivo: "Crédito incorreto", chaveIdempotencia: randomUUID() });
  assert.equal(resultado.status, 409); assert.equal(await saldo(), "0.00");
  assert.equal(await prisma.movimentacaoCarteira.count({ where: { carteiraId: aluno.carteira!.id } }), 1);
});

test("aprovações concorrentes preservam soma, e duas aprovações do mesmo pedido não duplicam", async () => {
  const a = await pix("10.10"); const b = await pix("20.20");
  const resultados = await Promise.all([aprovar(a.id), aprovar(b.id), aprovar(a.id)]);
  assert.ok(resultados.every((r) => r.status === 200), JSON.stringify(resultados));
  assert.equal(await saldo(), "30.30");
  assert.equal(await prisma.movimentacaoCarteira.count({ where: { carteiraId: aluno.carteira!.id } }), 2);
});

test("versão antiga não atualiza carteira e livro financeiro é somente inclusão", async () => {
  const antiga = await prisma.carteira.findUniqueOrThrow({ where: { id: aluno.carteira!.id } });
  const r = await pix(); await aprovar(r.id);
  const resultado = await prisma.carteira.updateMany({ where: { id: antiga.id, versao: antiga.versao }, data: { saldo: "999.00" } });
  assert.equal(resultado.count, 0); assert.equal(await saldo(), "10.00");
  await assert.rejects(db.query('UPDATE "MovimentacaoCarteira" SET valor=99 WHERE "carteiraId"=$1', [antiga.id]), /não podem/);
});

test("débitos concorrentes não ultrapassam o crédito e desfazem o ciclo recusado", async () => {
  await prisma.carteira.update({ where: { id: aluno.carteira!.id }, data: { saldo: "-18.00" } });
  const p = await participacao();
  const cobrar = () => executarTransacao(prisma, async (tx) => {
    const atual = await tx.participacaoTrecho.update({ where: { id: p.id }, data: { cicloConfirmacao: { increment: 1 } } });
    return debitar(tx, { participacaoId: p.id, cicloConfirmacao: atual.cicloConfirmacao, valor: "2.00", chaveIdempotencia: randomUUID(), realizadaPorId: aluno.usuarioId });
  });
  const resultados = await Promise.allSettled([cobrar(), cobrar()]);
  assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await saldo(), "-20.00");
  assert.equal((await prisma.participacaoTrecho.findUniqueOrThrow({ where: { id: p.id } })).cicloConfirmacao, 2);
});

test("estouro do saldo faz rollback da aprovação e da notificação", async () => {
  await prisma.carteira.update({ where: { id: aluno.carteira!.id }, data: { saldo: "99999999.00" } });
  const r = await pix("2.00");
  assert.equal((await aprovar(r.id)).status, 400);
  assert.equal((await prisma.recarga.findUniqueOrThrow({ where: { id: r.id } })).status, "PENDENTE");
  assert.equal(await saldo(), "99999999.00");
  assert.equal(await prisma.movimentacaoCarteira.count({ where: { carteiraId: aluno.carteira!.id } }), 0);
});

test("estudante, usuário e carteira são criados juntos e matrícula é única por unidade", async () => {
  const dados = { nome: "Novo aluno", cpf: "52998224725", email: "novo@example.com", telefone: "53999999999", senha: "SenhaForte123!", matricula: "NOVA", unidadeEnsinoId: unidade, previsaoConclusao: "2030-12-31" };
  const r = await api("POST", "/estudantes", operador, dados);
  assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.carteira.saldo, "0.00"); assert.equal(r.body.statusCadastro, "APROVADO");
  assert.equal(r.body.carteira.limiteCredito, "20.00");
  assert.equal(r.body.analisadoPor.id, operador);
  assert.equal(r.body.usuario.status, "AGUARDANDO_ATIVACAO");
  assert.equal(JSON.stringify(r.body).includes(dados.cpf), false);
  assert.equal(JSON.stringify(r.body).includes("senhaHash"), false);
  const outro = await api("POST", "/estudantes", operador, { ...dados, cpf: "11144477735", email: "outro@example.com" });
  assert.equal(outro.status, 409);
  assert.equal(await prisma.usuario.count({ where: { email: "outro@example.com" } }), 0);
  const unidadeNova = await prisma.unidadeEnsino.create({ data: { nome: "Outro campus", pontoParada: { create: { nome: "Outro ponto", cidade: "Pelotas" } }, instituicaoEnsino: { create: { nome: "Outra instituição", tipo: "FACULDADE" } } } });
  assert.equal((await api("POST", "/estudantes", operador, { ...dados, cpf: "11144477735", email: "outro@example.com", unidadeEnsinoId: unidadeNova.id })).status, 201);
});

test("cadastro unificado é exclusivo do operador e impede caminhos incompletos", async () => {
  const dados = { nome: "Aluno", cpf: "12345678909", email: "incompleto@example.com", telefone: "53999999999", senha: "SenhaForte123!", matricula: "INCOMPLETA", unidadeEnsinoId: unidade, previsaoConclusao: "2030-12-31" };
  assert.equal((await api("POST", "/estudantes", null, dados)).status, 401);
  for (const id of [aluno.usuarioId, motorista]) assert.equal((await api("POST", "/estudantes", id, dados)).status, 403);
  const { matricula, unidadeEnsinoId, previsaoConclusao, ...usuario } = dados;
  assert.equal((await api("POST", "/usuarios", operador, { ...usuario, perfil: "ESTUDANTE" })).status, 409);
  assert.equal((await api("POST", "/estudantes", operador, { usuarioId: aluno.usuarioId, matricula, unidadeEnsinoId, previsaoConclusao })).status, 400);
  assert.equal((await api("POST", "/operador/estudantes", operador, dados)).status, 404);
  for (const extra of [{ statusCadastro: "PENDENTE" }, { perfil: "OPERADOR" }, { carteira: { saldo: "100.00" } }]) {
    assert.equal((await api("POST", "/estudantes", operador, { ...dados, ...extra })).status, 400);
  }
  assert.equal(await prisma.usuario.count({ where: { email: dados.email } }), 0);
});

test("unidade indisponível impede cadastro sem deixar usuário nem carteira órfãos", async () => {
  const dados = { nome: "Aluno", cpf: "12345678909", email: "inativo@example.com", telefone: "53999999999", senha: "SenhaForte123!", matricula: "INATIVA", unidadeEnsinoId: unidade, previsaoConclusao: "2030-12-31" };
  const unidadeAtual = await prisma.unidadeEnsino.findUniqueOrThrow({ where: { id: unidade } });
  await prisma.pontoParada.update({ where: { id: unidadeAtual.pontoParadaId }, data: { ativo: false } });
  try {
    assert.equal((await api("POST", "/estudantes", operador, dados)).status, 409);
    assert.equal(await prisma.usuario.count({ where: { email: dados.email } }), 0);
  } finally {
    await prisma.pontoParada.update({ where: { id: unidadeAtual.pontoParadaId }, data: { ativo: true } });
  }
});

test("perfil acadêmico é próprio e suspensão e reativação preservam saldo e carteira", async () => {
  const r = await api("GET", "/estudantes/me");
  assert.equal(r.status, 200); assert.equal(r.body.id, aluno.id);
  assert.equal(r.body.usuario.id, aluno.usuarioId); assert.equal(r.body.usuario.cpf, undefined);
  assert.equal((await api("GET", `/estudantes/${aluno.id}`)).status, 403);
  assert.equal((await api("GET", "/estudantes/me", motorista)).status, 403);
  await prisma.carteira.update({ where: { id: aluno.carteira!.id }, data: { saldo: "7.50" } });
  assert.equal((await api("POST", `/estudantes/${aluno.id}/suspender`, operador, { motivo: "Revisão presencial" })).status, 200);
  assert.equal((await api("GET", "/carteira")).body.saldo, "7.50");
  const reativado = await api("POST", `/estudantes/${aluno.id}/reativar`, operador, {});
  assert.equal(reativado.status, 200);
  assert.equal(reativado.body.carteira.id, aluno.carteira!.id);
  assert.equal(reativado.body.carteira.saldo, "7.50");
});

test("edição considera matrícula e unidade juntas inclusive quando somente a unidade muda", async () => {
  const outro = await criarAluno();
  const unidadeNova = await prisma.unidadeEnsino.create({ data: { nome: "Campus edição", pontoParada: { create: { nome: "Ponto edição", cidade: "Pelotas" } }, instituicaoEnsino: { create: { nome: "Instituição edição", tipo: "FACULDADE" } } } });
  const original = await prisma.estudante.findUniqueOrThrow({ where: { id: aluno.id } });
  await prisma.estudante.update({ where: { id: outro.id }, data: { statusCadastro: "PENDENTE", unidadeEnsinoId: unidadeNova.id } });
  assert.equal((await api("PATCH", `/estudantes/${outro.id}`, operador, { matricula: original.matricula })).status, 200);
  assert.equal((await api("PATCH", `/estudantes/${outro.id}`, operador, { unidadeEnsinoId: unidade })).status, 409);
  assert.equal((await prisma.estudante.findUniqueOrThrow({ where: { id: outro.id } })).unidadeEnsinoId, unidadeNova.id);
});

test("aprovação de cadastro legado cria carteira ausente e registra o operador", async () => {
  await prisma.carteira.delete({ where: { id: aluno.carteira!.id } });
  await prisma.estudante.update({ where: { id: aluno.id }, data: { statusCadastro: "PENDENTE" } });
  const aprovado = await api("POST", `/estudantes/${aluno.id}/aprovar`, operador, {});
  assert.equal(aprovado.status, 200);
  assert.equal(aprovado.body.carteira.saldo, "0.00");
  assert.equal(aprovado.body.analisadoPor.id, operador);
  assert.equal((await api("GET", "/carteira")).status, 200);
  assert.equal((await api("POST", `/estudantes/${aluno.id}/aprovar`, operador, {})).status, 409);
  assert.equal(await prisma.carteira.count({ where: { estudanteId: aluno.id } }), 1);
});

test("comprovante aceita arquivo válido, mantém propriedade e recusa formato falso", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZQAAAABJRU5ErkJggg==", "base64");
  const enviar = async (conteudo: Buffer, usuarioId: string, extra = false) => {
    const form = new FormData();
    form.append("arquivo", new Blob([new Uint8Array(conteudo)], { type: "image/png" }), "matricula.png");
    if (extra) form.append("estudanteId", aluno.id);
    const res = await fetch(`${base}/estudantes/me/comprovantes`, { method: "POST", headers: { Authorization: `Bearer ${jwt.sign({ id: usuarioId }, process.env.JWT_SECRET!)}` }, body: form });
    return { status: res.status, body: await res.json() as any };
  };
  assert.equal((await enviar(png, motorista)).status, 403);
  const valido = await enviar(png, aluno.usuarioId);
  assert.equal(valido.status, 201, JSON.stringify(valido.body));
  assert.equal(valido.body.chaveArquivo, undefined);
  const salvo = await prisma.comprovanteMatricula.findUniqueOrThrow({ where: { id: valido.body.id } });
  assert.equal(salvo.estudanteId, aluno.id);
  assert.deepEqual(readFileSync(join(comprovantesDir, salvo.chaveArquivo)), png);
  const outro = await criarAluno();
  assert.equal((await api("GET", "/estudantes/me/comprovantes", outro.usuarioId)).body.dados.length, 0);
  assert.equal((await api("GET", "/estudantes/me/comprovantes")).body.dados.length, 1);
  assert.equal((await enviar(Buffer.from("arquivo falso"), aluno.usuarioId)).status, 415);
  assert.equal((await enviar(png, aluno.usuarioId, true)).status, 400);
  assert.equal(await prisma.comprovanteMatricula.count({ where: { estudanteId: aluno.id } }), 1);
});
