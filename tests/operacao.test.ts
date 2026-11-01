import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { PGlite } from "@electric-sql/pglite";
import { PrismaClient, Prisma } from "../generated/prisma";
import { adapterMemoria } from "./helpers/postgres-memoria";

process.env.JWT_SECRET = "segredo-exclusivo-dos-testes-sem-uso-real";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.NODE_ENV = "test";
process.env.MAILTRAP_USER = "test"; process.env.MAILTRAP_PASS = "test";
process.env.SMTP_FROM = "test@example.com";
const db = new PGlite();
const prisma = new PrismaClient({ adapter: adapterMemoria(db) });
const instante = Date.UTC(2027, 0, 10, 12);
let server: Server;
let base: string;
let operadorId: string;
let semestreId: string;
let unidadeId: string;
let pontos: string[];
let contador = 1000;
let recursos: typeof import("../src/modules/operacao/recursos.service");
let inscricoes: typeof import("../src/modules/operacao/participacoes.service");
let execucao: typeof import("../src/modules/operacao/execucao.service");
let disciplina: typeof import("../src/modules/operacao/disciplina.service");
let vans: typeof import("../src/modules/operacao/van.service");

async function usuario(perfil: "ESTUDANTE" | "MOTORISTA" | "OPERADOR") {
  contador++;
  return prisma.usuario.create({ data: { nome: `Pessoa ${contador}`, cpf: String(contador).padStart(11, "0"),
    email: `${contador}@example.com`, telefone: "53999999999", perfil, status: "ATIVA" } });
}
async function aluno(saldo = "100.00") {
  const u = await usuario("ESTUDANTE");
  return prisma.estudante.create({ data: { usuarioId: u.id, unidadeEnsinoId: unidadeId, matricula: `M${contador}`,
    previsaoConclusao: new Date("2030-12-31"), statusCadastro: "APROVADO", carteira: { create: { saldo } } }, include: { carteira: true } });
}
async function motorista() {
  const u = await usuario("MOTORISTA");
  return prisma.motorista.create({ data: { usuarioId: u.id, numeroCnh: String(contador).padStart(11, "0"),
    categoriaCnh: "D", validadeCnh: new Date("2035-12-31") } });
}
async function veiculo(capacidade: number, tipo: "ONIBUS" | "VAN" = "ONIBUS") {
  contador++;
  return prisma.veiculo.create({ data: { placa: `T${String(contador).padStart(6, "0")}`, identificacao: `Veiculo ${contador}`, tipo, capacidade } });
}
async function viagem(minutos = 180, capacidade = 1) {
  const m = await motorista(), v = await veiculo(capacidade);
  const rota = await prisma.rota.create({ data: { nome: `Rota ${++contador}`, paradas: { create: pontos.map((pontoParadaId, i) => ({ pontoParadaId, ordem: i + 1 })) } } });
  const inicio = new Date(Date.now() + minutos * 60000);
  const result = await prisma.viagem.create({ data: { data: new Date("2027-01-10"), turno: "TARDE", nomeRota: rota.nome,
    rotaId: rota.id, criadaPorId: operadorId, trechos: { create: (["IDA", "VOLTA"] as const).map((sentido, index) => {
      const saida = new Date(inicio.getTime() + index * 180 * 60000);
      const lista = index ? [...pontos].reverse() : pontos;
      return { sentido, saidaPrevistaEm: saida, chegadaPrevistaEm: new Date(saida.getTime() + 3600000),
        limiteConfirmacaoEm: new Date(saida.getTime() - 3600000), limiteCancelamentoEm: new Date(saida.getTime() - 3600000),
        paradas: { create: lista.map((pontoParadaId, i) => ({ pontoParadaId, ordem: i + 1, nome: `Parada ${i}`, cidade: "Pelotas" })) } };
    }) } }, include: { trechos: { orderBy: { saidaPrevistaEm: "asc" }, include: { paradas: { orderBy: { ordem: "asc" } } } } } });
  for (const t of result.trechos) await recursos.alocar(t.id, { motoristaId: m.id, veiculoId: v.id,
    motoristaExtraId: null, veiculoExtraId: null, motivo: "Alocacao de teste" }, operadorId);
  return { ...result, motorista: m, veiculo: v };
}
async function publicar(minutos = 180, capacidade = 1) {
  const v = await viagem(minutos, capacidade); await recursos.publicar(v.id, operadorId); return v;
}
function entrada(t: Awaited<ReturnType<typeof viagem>>["trechos"][number]) {
  return { origemId: t.paradas[0].id, destinoId: t.paradas[2].id };
}
async function request(method: string, path: string, usuarioId: string, body?: unknown) {
  return fetch(base + path, { method, headers: { "Content-Type": "application/json",
    Authorization: `Bearer ${jwt.sign({ id: usuarioId }, process.env.JWT_SECRET!, { expiresIn: "1h" })}` },
    body: body === undefined ? undefined : JSON.stringify(body) });
}

before(async () => {
  for (const pasta of readdirSync("prisma/migrations").filter((p) => /^\d/.test(p)).sort()) {
    await db.exec(readFileSync(`prisma/migrations/${pasta}/migration.sql`, "utf8"));
  }
  (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
  recursos = await import("../src/modules/operacao/recursos.service");
  inscricoes = await import("../src/modules/operacao/participacoes.service");
  execucao = await import("../src/modules/operacao/execucao.service");
  disciplina = await import("../src/modules/operacao/disciplina.service");
  vans = await import("../src/modules/operacao/van.service");
  operadorId = (await usuario("OPERADOR")).id;
  pontos = [];
  for (const [nome, cidade] of [["Prefeitura", "Pedro Osório"], ["Praça", "Pedro Osório"], ["Campus", "Pelotas"]]) {
    pontos.push((await prisma.pontoParada.create({ data: { nome, cidade } })).id);
  }
  unidadeId = (await prisma.unidadeEnsino.create({ data: { nome: "Campus", pontoParada: { connect: { id: pontos[2] } },
    instituicaoEnsino: { create: { nome: "Instituicao", tipo: "FACULDADE" } } } })).id;
  semestreId = (await disciplina.criarSemestre({ nome: "Semestre de teste", inicio: "2027-01-01T00:00:00Z", fim: "2027-07-01T00:00:00Z" }, operadorId)).id;
  const app = (await import("../src/app")).default;
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/operacao`;
});
beforeEach((t) => { if ("mock" in t) t.mock.timers.enable({ apis: ["Date"], now: instante }); });
after(async () => { if (server) await new Promise<void>((r) => server.close(() => r())); await prisma.$disconnect(); await db.close(); });

test("publicacao exige recursos, semestre e publica ambos sem cobrar", async () => {
  const v = await viagem();
  await prisma.trechoViagem.update({ where: { id: v.trechos[0].id }, data: { motoristaId: null } });
  await assert.rejects(recursos.publicar(v.id, operadorId), /Aloque/);
  assert.equal((await prisma.viagem.findUniqueOrThrow({ where: { id: v.id } })).status, "RASCUNHO");
  await recursos.alocar(v.trechos[0].id, { motoristaId: v.motorista.id, veiculoId: v.veiculo.id, motoristaExtraId: null, veiculoExtraId: null, motivo: "Correcao" }, operadorId);
  await recursos.publicar(v.id, operadorId);
  assert.equal(await prisma.trechoViagem.count({ where: { viagemId: v.id, status: "ABERTO" } }), 2);
  await assert.rejects(disciplina.criarSemestre({ nome: "Sobreposto", inicio: "2027-02-01T00:00:00Z", fim: "2027-03-01T00:00:00Z" }, operadorId), /sobrepor/);
});

test("confirmacao debita uma vez; espera nao cobra; cancelamento estorna e promove fila", async () => {
  const v = await publicar(), t = v.trechos[0], a = await aluno(), b = await aluno();
  const p = await inscricoes.inscrever(t.id, a.usuarioId, entrada(t));
  assert.equal(p.status, "CONFIRMADA");
  await inscricoes.inscrever(t.id, a.usuarioId, entrada(t));
  assert.equal((await prisma.carteira.findUniqueOrThrow({ where: { estudanteId: a.id } })).saldo.toFixed(2), "98.00");
  const q = await inscricoes.inscrever(t.id, b.usuarioId, entrada(t));
  assert.equal(q.status, "EM_ESPERA");
  assert.equal((await prisma.carteira.findUniqueOrThrow({ where: { estudanteId: b.id } })).saldo.toFixed(2), "100.00");
  await inscricoes.cancelarPropria(p.id, a.usuarioId); await inscricoes.cancelarPropria(p.id, a.usuarioId);
  assert.equal((await prisma.carteira.findUniqueOrThrow({ where: { estudanteId: a.id } })).saldo.toFixed(2), "100.00");
  assert.equal((await prisma.participacaoTrecho.findUniqueOrThrow({ where: { id: q.id } })).status, "CONFIRMADA");
  const nova = await inscricoes.inscrever(t.id, a.usuarioId, entrada(t));
  assert.equal(nova.status, "EM_ESPERA"); assert.ok(nova.ordemFila > q.ordemFila);
});

test("limite exato -20 permitido e sem saldo conserva fila sem cobrar", async () => {
  const v = await publicar(180, 3), t = v.trechos[0], a = await aluno("-18.00"), b = await aluno("-19.00"), c = await aluno();
  assert.equal((await inscricoes.inscrever(t.id, a.usuarioId, entrada(t))).status, "CONFIRMADA");
  assert.equal((await prisma.carteira.findUniqueOrThrow({ where: { estudanteId: a.id } })).saldo.toFixed(2), "-20.00");
  assert.equal((await inscricoes.inscrever(t.id, b.usuarioId, entrada(t))).status, "EM_ESPERA");
  assert.equal((await inscricoes.inscrever(t.id, c.usuarioId, entrada(t))).status, "CONFIRMADA");
});

test("ultima vaga em chamadas simultaneas nao excede capacidade", async () => {
  const v = await publicar(), a = await aluno(), b = await aluno(), t = v.trechos[0];
  await Promise.all([inscricoes.inscrever(t.id, a.usuarioId, entrada(t)), inscricoes.inscrever(t.id, b.usuarioId, entrada(t))]);
  assert.equal(await prisma.participacaoTrecho.count({ where: { trechoId: t.id, status: "CONFIRMADA" } }), 1);
  assert.equal(await prisma.participacaoTrecho.count({ where: { trechoId: t.id, status: "EM_ESPERA" } }), 1);
});

test("ida e volta juntas fazem rollback se uma nao tiver vaga", async () => {
  const v = await publicar(), a = await aluno(), b = await aluno();
  await inscricoes.inscrever(v.trechos[1].id, a.usuarioId, entrada(v.trechos[1]));
  await assert.rejects(inscricoes.inscreverDupla(b.usuarioId, { trechos: v.trechos.map((t) => ({ trechoId: t.id, ...entrada(t) })) }), /juntas/);
  assert.equal(await prisma.participacaoTrecho.count({ where: { estudanteId: b.id } }), 0);
  assert.equal((await prisma.carteira.findUniqueOrThrow({ where: { estudanteId: b.id } })).saldo.toFixed(2), "100.00");
});

test("apos corte somente operador confirma; janela tardia tem 30min limitada ao inicio", async (ctx) => {
  const v = await publicar(), t = v.trechos[0], a = await aluno(), b = await aluno();
  const p = await inscricoes.inscrever(t.id, a.usuarioId, entrada(t));
  const q = await inscricoes.inscrever(t.id, b.usuarioId, entrada(t));
  ctx.mock.timers.setTime(t.saidaPrevistaEm.getTime() - 40 * 60000);
  await assert.rejects(inscricoes.cancelarPropria(p.id, a.usuarioId), /Prazo/);
  await assert.rejects(inscricoes.inscrever(t.id, b.usuarioId, entrada(t)), /Prazo/);
  await execucao.cancelarTrecho(v.trechos[1].id, operadorId, "Cancelamento de teste");
  const extraM = await motorista(), extraV = await veiculo(1, "VAN");
  await recursos.alocar(t.id, { motoristaId: v.motorista.id, veiculoId: v.veiculo.id, motoristaExtraId: extraM.id, veiculoExtraId: extraV.id, motivo: "Van extra" }, operadorId);
  const confirmado = await inscricoes.confirmarOperador(t.id, b.id, operadorId, "Inclusao tardia autorizada");
  assert.equal(confirmado.limiteEstornoEm?.getTime(), Date.now() + 30 * 60000);
  await inscricoes.cancelarPropria(q.id, b.usuarioId);
  assert.equal((await prisma.carteira.findUniqueOrThrow({ where: { estudanteId: b.id } })).saldo.toFixed(2), "100.00");
});

test("QR e embarque respeitam motorista e nao cobram outra vez; conclusao conta falta uma vez", async () => {
  const v = await publicar(180, 2), t = v.trechos[0], a = await aluno(), b = await aluno();
  const p = await inscricoes.inscrever(t.id, a.usuarioId, entrada(t));
  const q = await inscricoes.inscrever(t.id, b.usuarioId, entrada(t));
  const qr = await execucao.gerarQr(p.id, a.usuarioId);
  await execucao.iniciar(t.id, operadorId);
  const estranho = await motorista();
  await assert.rejects(execucao.embarcar(t.id, { qr: qr.qr }, { id: estranho.usuarioId, perfil: "MOTORISTA" }), /atribu/);
  await execucao.embarcar(t.id, { qr: qr.qr }, { id: v.motorista.usuarioId, perfil: "MOTORISTA" });
  await execucao.embarcar(t.id, { participacaoId: p.id }, { id: v.motorista.usuarioId, perfil: "MOTORISTA" });
  assert.equal(await prisma.embarque.count({ where: { participacaoId: p.id } }), 1);
  assert.equal((await prisma.carteira.findUniqueOrThrow({ where: { estudanteId: a.id } })).saldo.toFixed(2), "98.00");
  await execucao.concluir(t.id, operadorId); await execucao.concluir(t.id, operadorId);
  assert.equal(await prisma.falta.count({ where: { participacaoId: q.id } }), 1);
  assert.equal(await prisma.falta.count({ where: { participacaoId: p.id } }), 0);
  assert.equal((await prisma.carteira.findUniqueOrThrow({ where: { estudanteId: b.id } })).saldo.toFixed(2), "98.00");
});

test("cancelamento invalida QR antigo e reconfirmacao gera novo ciclo", async () => {
  const v = await publicar(), t = v.trechos[0], a = await aluno();
  const p = await inscricoes.inscrever(t.id, a.usuarioId, entrada(t));
  const qr = await execucao.gerarQr(p.id, a.usuarioId);
  await inscricoes.cancelarPropria(p.id, a.usuarioId);
  const novo = await inscricoes.inscrever(t.id, a.usuarioId, entrada(t));
  assert.equal(novo.cicloConfirmacao, 2);
  await execucao.iniciar(t.id, operadorId);
  await assert.rejects(execucao.embarcar(t.id, { qr: qr.qr }, { id: operadorId, perfil: "OPERADOR" }), /anterior/);
});

test("cancelamento da viagem estorna uma vez ambos os trechos", async () => {
  const v = await publicar(), a = await aluno();
  await inscricoes.inscreverDupla(a.usuarioId, { trechos: v.trechos.map((t) => ({ trechoId: t.id, ...entrada(t) })) });
  await execucao.cancelarViagem(v.id, operadorId, "Cancelamento da viagem");
  await execucao.cancelarViagem(v.id, operadorId, "Cancelamento da viagem");
  assert.equal((await prisma.carteira.findUniqueOrThrow({ where: { estudanteId: a.id } })).saldo.toFixed(2), "100.00");
  assert.equal(await prisma.movimentacaoCarteira.count({ where: { carteiraId: a.carteira!.id, tipo: "ESTORNO" } }), 2);
});

test("recursos respeitam intervalo entre viagens e capacidade nao pode expulsar confirmados", async () => {
  const v = await publicar(180, 2), a = await aluno(), b = await aluno(), t = v.trechos[0];
  await inscricoes.inscrever(t.id, a.usuarioId, entrada(t)); await inscricoes.inscrever(t.id, b.usuarioId, entrada(t));
  const pequeno = await veiculo(1);
  await assert.rejects(recursos.alocar(t.id, { motoristaId: v.motorista.id, veiculoId: pequeno.id,
    motoristaExtraId: null, veiculoExtraId: null, motivo: "Troca menor" }, operadorId), /insuficiente/);
  const outra = await viagem(190);
  await assert.rejects(recursos.alocar(outra.trechos[0].id, { motoristaId: v.motorista.id, veiculoId: v.veiculo.id,
    motoristaExtraId: null, veiculoExtraId: null, motivo: "Conflito" }, operadorId), /Conflito/);
});

test("van exige avaliacao na ultima hora, aceite do motorista e respeita prazo", async (ctx) => {
  const v = await publicar(), a = await aluno(), b = await aluno(), t = v.trechos[0];
  await inscricoes.inscrever(t.id, a.usuarioId, entrada(t)); await inscricoes.inscrever(t.id, b.usuarioId, entrada(t));
  const m = await motorista(), van = await veiculo(2, "VAN");
  await assert.rejects(vans.solicitarVan(t.id, m.id, van.id, 20, operadorId), /hora/);
  ctx.mock.timers.setTime(t.saidaPrevistaEm.getTime() - 50 * 60000);
  const c = await vans.solicitarVan(t.id, m.id, van.id, 20, operadorId);
  await assert.rejects(vans.responderVan(c.id, a.usuarioId, true), /encontrada/);
  await vans.responderVan(c.id, m.usuarioId, true); await vans.responderVan(c.id, m.usuarioId, true);
  assert.equal((await prisma.trechoViagem.findUniqueOrThrow({ where: { id: t.id } })).capacidadeExtra, 2);
  assert.equal((await prisma.participacaoTrecho.findUniqueOrThrow({ where: { trechoId_estudanteId: { trechoId: t.id, estudanteId: b.id } } })).status, "EM_ESPERA");
  await inscricoes.confirmarOperador(t.id, b.id, operadorId, "Vaga extra confirmada");
  assert.equal((await prisma.carteira.findUniqueOrThrow({ where: { estudanteId: b.id } })).saldo.toFixed(2), "98.00");
});

test("tarefas avaliam van e expiram espera sem cobrar", async (ctx) => {
  const v = await publicar(), a = await aluno(), b = await aluno(), t = v.trechos[0];
  await inscricoes.inscrever(t.id, a.usuarioId, entrada(t)); const q = await inscricoes.inscrever(t.id, b.usuarioId, entrada(t));
  ctx.mock.timers.setTime(t.saidaPrevistaEm.getTime() - 50 * 60000);
  await vans.processarPrazos(); await vans.processarPrazos();
  assert.equal(await prisma.notificacao.count({ where: { usuarioId: operadorId, chaveDeduplicacao: { startsWith: `avaliar-van:${t.id}:` } } }), 1);
  const m = await motorista(), van = await veiculo(1, "VAN");
  const c = await vans.solicitarVan(t.id, m.id, van.id, 20, operadorId);
  ctx.mock.timers.setTime(t.saidaPrevistaEm.getTime() - 29 * 60000);
  await vans.processarPrazos();
  assert.equal((await prisma.convocacaoVan.findUniqueOrThrow({ where: { id: c.id } })).status, "EXPIRADA");
  await assert.rejects(vans.responderVan(c.id, m.usuarioId, true), /expirada/);
  ctx.mock.timers.setTime(t.saidaPrevistaEm.getTime()); await vans.processarPrazos();
  assert.equal((await prisma.participacaoTrecho.findUniqueOrThrow({ where: { id: q.id } })).status, "EXPIRADA");
  assert.equal((await prisma.carteira.findUniqueOrThrow({ where: { estudanteId: b.id } })).saldo.toFixed(2), "100.00");
});

test("disciplina 3/4/8/12 preserva cobranca, bloqueia acesso e estorna futuras", async () => {
  const a = await aluno(), v = await publicar(), t = v.trechos[0];
  const futura = await inscricoes.inscrever(t.id, a.usuarioId, entrada(t));
  for (let i = 1; i <= 12; i++) {
    const historica = await viagem();
    const h = historica.trechos[0];
    await prisma.trechoViagem.update({ where: { id: h.id }, data: { status: "CONCLUIDO" } });
    const participante = await prisma.participacaoTrecho.create({ data: {
      estudanteId: a.id, trechoId: h.id, origemId: h.paradas[0].id,
      destinoId: h.paradas[2].id, status: "CONFIRMADA",
    } });
    await prisma.falta.create({ data: { participacaoId: participante.id, estudanteId: a.id, semestreId } });
    await prisma.$transaction((tx) => disciplina.avaliarDisciplinaTx(tx, a.id, semestreId, operadorId));
    if (i === 3) assert.equal(await prisma.advertencia.count({ where: { estudanteId: a.id } }), 0);
    if (i === 4) assert.equal((await request("GET", "/participacoes/minhas", a.usuarioId)).status, 200);
    if (i === 8) {
      assert.equal(await inscricoes.elegivel(prisma, a.id, new Date()), null);
      assert.equal((await prisma.participacaoTrecho.findUniqueOrThrow({ where: { id: futura.id } })).status, "CONFIRMADA");
      assert.equal((await request("GET", "/participacoes/minhas", a.usuarioId)).status, 200);
    }
  }
  assert.equal(await prisma.advertencia.count({ where: { estudanteId: a.id } }), 3);
  assert.equal((await request("GET", "/participacoes/minhas", a.usuarioId)).status, 403);
  assert.equal((await prisma.participacaoTrecho.findUniqueOrThrow({ where: { id: futura.id } })).status, "CANCELADA");
  assert.equal((await prisma.carteira.findUniqueOrThrow({ where: { estudanteId: a.id } })).saldo.toFixed(2), "100.00");
  const falta = await prisma.falta.findFirstOrThrow({ where: { estudanteId: a.id } });
  await disciplina.justificarFalta(falta.id, a.usuarioId, "Justificativa de teste");
  await disciplina.analisarFalta(falta.id, operadorId, true, "Justificativa aceita");
  assert.equal(await prisma.falta.count({ where: { estudanteId: a.id, justificada: false } }), 11);
  assert.equal((await request("GET", "/participacoes/minhas", a.usuarioId)).status, 403);
  await disciplina.liberarDisciplina(a.id, semestreId, operadorId, "Revisao presencial");
  assert.equal((await request("GET", "/participacoes/minhas", a.usuarioId)).status, 200);
  await prisma.usuario.update({ where: { id: a.usuarioId }, data: { status: "BLOQUEADA" } });
  await disciplina.liberarDisciplina(a.id, semestreId, operadorId, "Revisao disciplinar adicional");
  assert.equal((await request("GET", "/participacoes/minhas", a.usuarioId)).status, 403);
});

test("adiamento nao reabre confirmacao/cancelamento sem autorizacao expressa", async (ctx) => {
  const v = await publicar(), a = await aluno(), b = await aluno(), t = v.trechos[0];
  const p = await inscricoes.inscrever(t.id, a.usuarioId, entrada(t));
  ctx.mock.timers.setTime(t.saidaPrevistaEm.getTime() - 30 * 60000);
  const dados = { saidaPrevistaEm: new Date(t.saidaPrevistaEm.getTime() + 120 * 60000).toISOString(),
    chegadaPrevistaEm: new Date(t.chegadaPrevistaEm.getTime() + 120 * 60000).toISOString(), motivo: "Adiamento de teste", reabrir: false };
  await execucao.alterarHorario(t.id, dados, operadorId);
  await assert.rejects(inscricoes.inscrever(t.id, b.usuarioId, entrada(t)), /Prazo/);
  await assert.rejects(inscricoes.cancelarPropria(p.id, a.usuarioId), /Prazo/);
  await execucao.alterarHorario(t.id, { ...dados, reabrir: true }, operadorId);
  await inscricoes.cancelarPropria(p.id, a.usuarioId);
  assert.equal((await inscricoes.inscrever(t.id, b.usuarioId, entrada(t))).status, "CONFIRMADA");
});

test("saldo regularizado antes do corte permite promocao automatica sem nova inscricao", async () => {
  const v = await publicar(), a = await aluno("-19.00"), t = v.trechos[0];
  const p = await inscricoes.inscrever(t.id, a.usuarioId, entrada(t));
  assert.equal(p.status, "EM_ESPERA");
  await prisma.carteira.update({ where: { estudanteId: a.id }, data: { saldo: "0.00" } });
  await vans.processarPrazos();
  assert.equal((await prisma.participacaoTrecho.findUniqueOrThrow({ where: { id: p.id } })).status, "CONFIRMADA");
  assert.equal((await prisma.carteira.findUniqueOrThrow({ where: { estudanteId: a.id } })).saldo.toFixed(2), "-2.00");
});

test("justificativa e participacao nao sao acessiveis por outro estudante", async () => {
  const v = await publicar(), a = await aluno(), b = await aluno(), t = v.trechos[0];
  const p = await inscricoes.inscrever(t.id, a.usuarioId, entrada(t));
  await assert.rejects(inscricoes.cancelarPropria(p.id, b.usuarioId), /encontrada/);
  await assert.rejects(execucao.gerarQr(p.id, b.usuarioId), /QR Code/);
  const falta = await prisma.falta.create({ data: { participacaoId: p.id, estudanteId: a.id, semestreId } });
  await assert.rejects(disciplina.justificarFalta(falta.id, b.usuarioId, "Justificativa indevida"), /encontrada/);
});

test("fim do semestre encerra impedimento disciplinar sem apagar historico", async (ctx) => {
  const a = await aluno();
  const semestre = await prisma.semestreLetivo.findUniqueOrThrow({ where: { id: semestreId } });
  await prisma.advertencia.create({ data: { estudanteId: a.id, semestreId, numero: 3 } });
  await prisma.usuario.update({ where: { id: a.usuarioId }, data: { bloqueioDisciplinarAte: semestre.fim } });
  assert.equal((await request("GET", "/participacoes/minhas", a.usuarioId)).status, 403);
  ctx.mock.timers.setTime(semestre.fim.getTime() + 1000);
  assert.equal((await request("GET", "/participacoes/minhas", a.usuarioId)).status, 200);
  assert.ok(await inscricoes.elegivel(prisma, a.id, new Date()));
  assert.equal(await prisma.advertencia.count({ where: { estudanteId: a.id } }), 1);
});

test("API impede aluno publicar e motorista consultar passageiros de outro atendimento", async () => {
  const v = await publicar(), a = await aluno(), m = await motorista();
  assert.equal((await request("POST", `/viagens/${v.id}/publicar`, a.usuarioId)).status, 403);
  assert.equal((await request("GET", `/trechos/${v.trechos[0].id}/passageiros`, m.usuarioId)).status, 403);
  assert.equal((await request("GET", "/trechos", a.usuarioId)).status, 200);
  assert.equal((await request("GET", `/participacoes/00000000-0000-4000-8000-000000000001/qr`, a.usuarioId)).status, 404);
});

test("REVISAO: publicacao rejeita capacidade extra desatualizada", async () => {
  const v=await viagem(180,1), t=v.trechos[0];
  const m=await motorista(), extra=await veiculo(10,"VAN");
  await recursos.alocar(t.id,{motoristaId:v.motorista.id,veiculoId:v.veiculo.id,motoristaExtraId:m.id,veiculoExtraId:extra.id,motivo:"Revisao de capacidade"},operadorId);
  await prisma.veiculo.update({where:{id:extra.id},data:{capacidade:2}});
  await assert.rejects(recursos.publicar(v.id,operadorId), /capacidade|Capacidade/);
});

test("REVISAO: antecipar saida reduz limite do estorno tardio", async (ctx) => {
  const v=await publicar(180,1), t=v.trechos[0], a=await aluno("-20.00");
  const p=await inscricoes.inscrever(t.id,a.usuarioId,entrada(t));
  assert.equal(p.status,"EM_ESPERA");
  ctx.mock.timers.setTime(t.saidaPrevistaEm.getTime()-40*60000);
  await prisma.carteira.update({where:{estudanteId:a.id},data:{saldo:"100.00"}});
  await inscricoes.confirmarOperador(t.id,a.id,operadorId,"Confirmacao tardia para revisao");
  const novaSaida=new Date(Date.now()+10*60000);
  await execucao.alterarHorario(t.id,{saidaPrevistaEm:novaSaida.toISOString(),chegadaPrevistaEm:new Date(novaSaida.getTime()+3600000).toISOString(),reabrir:false,motivo:"Antecipacao para revisao"},operadorId);
  const atual=await prisma.participacaoTrecho.findUniqueOrThrow({where:{id:p.id}});
  assert.ok(atual.limiteEstornoEm && atual.limiteEstornoEm <= novaSaida,"Janela tardia ficou depois da nova saida");
});

test("REVISAO: cancelar depois da saida antecipada nao estorna", async (ctx) => {
  const v=await publicar(180,1), t=v.trechos[0], a=await aluno("-20.00");
  const p=await inscricoes.inscrever(t.id,a.usuarioId,entrada(t));
  ctx.mock.timers.setTime(t.saidaPrevistaEm.getTime()-40*60000);
  await prisma.carteira.update({where:{estudanteId:a.id},data:{saldo:"100.00"}});
  await inscricoes.confirmarOperador(t.id,a.id,operadorId,"Confirmacao tardia para revisao");
  const novaSaida=new Date(Date.now()+10*60000);
  await execucao.alterarHorario(t.id,{saidaPrevistaEm:novaSaida.toISOString(),chegadaPrevistaEm:new Date(novaSaida.getTime()+3600000).toISOString(),reabrir:false,motivo:"Antecipacao para revisao"},operadorId);
  ctx.mock.timers.setTime(novaSaida.getTime()+60000);
  await assert.rejects(inscricoes.cancelarPropria(p.id,a.usuarioId));
});

test("inclusao excepcional respeita fila, permanece esperando e nao duplica cobranca", async(ctx)=>{
  const v=await publicar(),t=v.trechos[0],anterior=await aluno("-20.00"),novo=await aluno();
  const primeiro=await inscricoes.inscrever(t.id,anterior.usuarioId,entrada(t));
  ctx.mock.timers.setTime(t.saidaPrevistaEm.getTime()-40*60000);
  await prisma.carteira.update({where:{estudanteId:anterior.id},data:{saldo:"100.00"}});
  const dados={estudanteId:novo.id,...entrada(t),motivo:"Inclusao presencial excepcional"};
  const response=await request("POST",'/trechos/'+t.id+'/inclusoes-excepcionais',operadorId,dados);
  assert.equal(response.status,200);const inserido=await response.json() as any;
  assert.equal(inserido.status,"EM_ESPERA");
  assert.equal((await prisma.participacaoTrecho.findUniqueOrThrow({where:{id:primeiro.id}})).status,"CONFIRMADA");
  assert.equal((await prisma.carteira.findUniqueOrThrow({where:{estudanteId:novo.id}})).saldo.toFixed(2),"100.00");
  const maior=await veiculo(2);
  await recursos.alocar(t.id,{motoristaId:v.motorista.id,veiculoId:maior.id,motoristaExtraId:null,veiculoExtraId:null,motivo:"Aumento da capacidade"},operadorId);
  const confirmado=await inscricoes.incluirOperador(t.id,operadorId,dados);
  assert.equal(confirmado.status,"CONFIRMADA");assert.equal(confirmado.ordemFila.toString(),inserido.ordemFila);
  await inscricoes.incluirOperador(t.id,operadorId,dados);
  assert.equal((await prisma.carteira.findUniqueOrThrow({where:{estudanteId:novo.id}})).saldo.toFixed(2),"98.00");
  const registro=await prisma.alteracaoParticipacao.findFirst({where:{participacaoId:confirmado.id,acao:"ENTRADA_FILA"}});
  assert.equal(registro?.realizadaPorId,operadorId);assert.equal(registro?.motivo,dados.motivo);
});

test("inclusao excepcional valida autor, motivo, pontos, saldo e inicio", async(ctx)=>{
  const v=await publicar(),t=v.trechos[0],a=await aluno("-20.00");
  ctx.mock.timers.setTime(t.saidaPrevistaEm.getTime()-40*60000);
  const dados={estudanteId:a.id,...entrada(t),motivo:"Inclusao autorizada"};
  const path='/trechos/'+t.id+'/inclusoes-excepcionais';
  assert.equal((await request("POST",path,a.usuarioId,dados)).status,403);
  assert.equal((await request("POST",path,operadorId,{...dados,motivo:""})).status,400);
  await assert.rejects(inscricoes.incluirOperador(t.id,operadorId,{...dados,destinoId:dados.origemId}),/Origem/);
  assert.equal(await prisma.participacaoTrecho.count({where:{estudanteId:a.id}}),0);
  const p=await inscricoes.incluirOperador(t.id,operadorId,dados);assert.equal(p.status,"EM_ESPERA");
  assert.equal((await prisma.carteira.findUniqueOrThrow({where:{estudanteId:a.id}})).saldo.toFixed(2),"-20.00");
  await execucao.iniciar(t.id,operadorId);
  await assert.rejects(inscricoes.incluirOperador(t.id,operadorId,dados),/indisponível/);
});

test("inicio exige rever capacidade reduzida e realocar todos antes de prosseguir", async()=>{
  const v=await publicar(180,2),t=v.trechos[0],a=await aluno(),b=await aluno();
  await inscricoes.inscrever(t.id,a.usuarioId,entrada(t));await inscricoes.inscrever(t.id,b.usuarioId,entrada(t));
  await prisma.veiculo.update({where:{id:v.veiculo.id},data:{capacidade:1}});
  await assert.rejects(execucao.iniciar(t.id,operadorId),/Capacidade/);
  await assert.rejects(recursos.alocar(t.id,{motoristaId:v.motorista.id,veiculoId:v.veiculo.id,motoristaExtraId:null,veiculoExtraId:null,motivo:"Revisao sem vagas"},operadorId),/insuficiente/);
  const m=await motorista(),extra=await veiculo(1,"VAN");
  await recursos.alocar(t.id,{motoristaId:v.motorista.id,veiculoId:v.veiculo.id,motoristaExtraId:m.id,veiculoExtraId:extra.id,motivo:"Realocacao com apoio"},operadorId);
  await execucao.iniciar(t.id,operadorId);
  assert.equal(await prisma.participacaoTrecho.count({where:{trechoId:t.id,status:"CONFIRMADA"}}),2);
});

test("adiar nao amplia estorno tardio e inicio real encerra a janela",async(ctx)=>{
  const v=await publicar(),t=v.trechos[0],a=await aluno("-20.00");
  const p=await inscricoes.inscrever(t.id,a.usuarioId,entrada(t));ctx.mock.timers.setTime(t.saidaPrevistaEm.getTime()-40*60000);
  await prisma.carteira.update({where:{estudanteId:a.id},data:{saldo:"100.00"}});
  const c=await inscricoes.confirmarOperador(t.id,a.id,operadorId,"Confirmacao excepcional");
  await execucao.alterarHorario(t.id,{saidaPrevistaEm:new Date(t.saidaPrevistaEm.getTime()+10*60000).toISOString(),chegadaPrevistaEm:new Date(t.chegadaPrevistaEm.getTime()+10*60000).toISOString(),reabrir:false,motivo:"Adiamento"},operadorId);
  assert.equal((await prisma.participacaoTrecho.findUniqueOrThrow({where:{id:p.id}})).limiteEstornoEm?.getTime(),c.limiteEstornoEm?.getTime());
  await execucao.iniciar(t.id,operadorId);
  assert.equal((await prisma.participacaoTrecho.findUniqueOrThrow({where:{id:p.id}})).limiteEstornoEm?.getTime(),Date.now());
  await assert.rejects(inscricoes.cancelarPropria(p.id,a.usuarioId),/permite/);
});

async function rotaAlternativa(manterCampus = false) {
  const ponto = await prisma.pontoParada.create({ data: { nome: "Novo campus", cidade: "Pelotas" } });
  const ids = [...pontos.slice(0, 2), ...(manterCampus ? [pontos[2]] : []), ponto.id];
  const rota = await prisma.rota.create({ data: { nome: 'Alternativa '+(++contador), paradas: { create: ids.map((pontoParadaId, i) => ({ pontoParadaId, ordem: i+1 })) } } });
  return { rota, ponto };
}

test("troca de rota exige solucao de ambas as pernas e reverte estorno se alguma falhar", async()=>{
  const v=await publicar(),a=await aluno();
  const ps=await inscricoes.inscreverDupla(a.usuarioId,{trechos:v.trechos.map(t=>({trechoId:t.id,...entrada(t)}))});
  const {rota}=await rotaAlternativa();
  const apiRota=await import("../src/modules/operacao/rota.service");
  await assert.rejects(apiRota.alterarRotaPublicada(v.id,operadorId,{rotaId:rota.id,motivo:"Mudanca de itinerario",resolucoes:[{participacaoId:ps[0].id,acao:"CANCELAR",motivo:"Sem parada adequada"}]}),/Resolva/);
  assert.equal((await prisma.viagem.findUniqueOrThrow({where:{id:v.id}})).rotaId,v.rotaId);
  assert.equal(await prisma.participacaoTrecho.count({where:{estudanteId:a.id,status:"CONFIRMADA"}}),2);
  assert.equal((await prisma.carteira.findUniqueOrThrow({where:{estudanteId:a.id}})).saldo.toFixed(2),"96.00");
  assert.equal(await prisma.movimentacaoCarteira.count({where:{carteiraId:a.carteira!.id,tipo:"ESTORNO"}}),0);
  assert.equal(await prisma.paradaTrecho.count({where:{trechoId:{in:v.trechos.map(t=>t.id)},ativa:false}}),0);
});

test("troca conjunta cancela com estorno, realoca volta, preserva historico e rejeita paradas antigas", async()=>{
  const v=await publicar(),a=await aluno();
  const ps=await inscricoes.inscreverDupla(a.usuarioId,{trechos:v.trechos.map(t=>({trechoId:t.id,...entrada(t)}))});
  const {rota,ponto}=await rotaAlternativa();
  const dados={rotaId:rota.id,motivo:"Novo itinerario acordado",resolucoes:[
    {participacaoId:ps[0].id,acao:"CANCELAR",motivo:"Sem embarque adequado na ida"},
    {participacaoId:ps[1].id,acao:"REALOCAR",origemPontoId:ponto.id,destinoPontoId:pontos[0]},
  ]};
  const url='/viagens/'+v.id+'/rota';
  assert.equal((await request("PATCH",url,a.usuarioId,dados)).status,403);
  const res=await request("PATCH",url,operadorId,dados);assert.equal(res.status,200,await res.text());
  const ida=await prisma.participacaoTrecho.findUniqueOrThrow({where:{id:ps[0].id},include:{origem:true}});
  const volta=await prisma.participacaoTrecho.findUniqueOrThrow({where:{id:ps[1].id},include:{origem:true,destino:true}});
  assert.equal(ida.status,"CANCELADA");assert.equal(ida.origemId,ps[0].origemId);assert.equal(ida.origem.ativa,false);
  assert.equal(volta.status,"CONFIRMADA");assert.equal(volta.origem.pontoParadaId,ponto.id);assert.equal(volta.origem.ativa,true);
  assert.equal((await prisma.carteira.findUniqueOrThrow({where:{estudanteId:a.id}})).saldo.toFixed(2),"98.00");
  const idaPontos=await prisma.paradaTrecho.findMany({where:{trechoId:v.trechos[0].id,ativa:true},orderBy:{ordem:"asc"}});
  const voltaPontos=await prisma.paradaTrecho.findMany({where:{trechoId:v.trechos[1].id,ativa:true},orderBy:{ordem:"asc"}});
  assert.deepEqual(voltaPontos.map(p=>p.pontoParadaId),idaPontos.map(p=>p.pontoParadaId).reverse());
  assert.equal((await (await request("GET",'/trechos/'+v.trechos[0].id,a.usuarioId)).json() as any).paradas.length,3);
  const b=await aluno();await assert.rejects(inscricoes.inscrever(v.trechos[0].id,b.usuarioId,entrada(v.trechos[0])),/Origem/);
  assert.equal((await request("PATCH",url,operadorId,dados)).status,409);
  assert.equal(await prisma.movimentacaoCarteira.count({where:{carteiraId:a.carteira!.id,tipo:"ESTORNO"}}),1);
});

test("troca preserva pontos ainda validos e bloqueia trecho iniciado ou resolucao alheia", async()=>{
  const v=await publicar(),a=await aluno();const t=v.trechos[0];
  const p=await inscricoes.inscrever(t.id,a.usuarioId,entrada(t));const {rota}=await rotaAlternativa(true);
  const apiRota=await import("../src/modules/operacao/rota.service");
  await assert.rejects(apiRota.alterarRotaPublicada(v.id,operadorId,{rotaId:rota.id,motivo:"Nova rota",resolucoes:[{participacaoId:"00000000-0000-4000-8000-000000000099",acao:"CANCELAR",motivo:"Alheia"}]}),/participação ativa/);
  await apiRota.alterarRotaPublicada(v.id,operadorId,{rotaId:rota.id,motivo:"Novo percurso",resolucoes:[]});
  const atual=await prisma.participacaoTrecho.findUniqueOrThrow({where:{id:p.id},include:{origem:true,destino:true}});
  assert.equal(atual.origem.pontoParadaId,pontos[0]);assert.equal(atual.destino.pontoParadaId,pontos[2]);assert.notEqual(atual.origemId,p.origemId);
  assert.equal((await prisma.carteira.findUniqueOrThrow({where:{estudanteId:a.id}})).saldo.toFixed(2),"98.00");
  await execucao.iniciar(t.id,operadorId);
  await assert.rejects(apiRota.alterarRotaPublicada(v.id,operadorId,{rotaId:v.rotaId,motivo:"Voltar rota",resolucoes:[]}),/não iniciadas/);
});
