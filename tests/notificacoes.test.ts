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
let aluno: string;
let operador: string;
let motorista: string;
let service: typeof import("../src/modules/notificacoes/notificacoes.service");
let job: typeof import("../src/modules/notificacoes/notificacoes.job");
let contador = 0;
async function api(method: string, path: string, id: string | null = aluno, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json",
    ...(id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET!)}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() as any };
}
async function registrar(tema: Parameters<typeof import("../src/modules/notificacoes/notificacoes.service").registrarNotificacao>[1]["tema"], usuarioId = aluno, chave = `teste:${++contador}`) {
  return prisma.$transaction(tx => service.registrarNotificacao(tx, { usuarioId, chaveDeduplicacao: chave, tipo: "TESTE", tema, titulo: "Título", mensagem: "Mensagem" }));
}
before(async () => {
  for (const pasta of readdirSync("prisma/migrations").filter(p => /^\d/.test(p)).sort()) await db.exec(readFileSync(`prisma/migrations/${pasta}/migration.sql`, "utf8"));
  (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
  for (const [i, perfil] of (["ESTUDANTE", "OPERADOR", "MOTORISTA"] as const).entries()) {
    const u = await prisma.usuario.create({ data: { nome: perfil, cpf: `${i}`.repeat(11), email: `${i}@example.com`, telefone: "53999999999", perfil, status: "ATIVA" } });
    if (i === 0) aluno = u.id; else if (i === 1) operador = u.id; else motorista = u.id;
  }
  service = await import("../src/modules/notificacoes/notificacoes.service");
  job = await import("../src/modules/notificacoes/notificacoes.job");
  const app = (await import("../src/app")).default;
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/notificacoes`;
});
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.$disconnect(); await db.close();
});

test("rotas autenticadas, configurações padrão e acesso dos três perfis", async () => {
  assert.equal((await api("GET", "/", null)).status, 401);
  for (const id of [aluno, operador, motorista]) {
    const res = await api("GET", "/preferencias", id);
    assert.equal(res.status, 200);
    assert.equal(res.body.ativadas, true); assert.equal(res.body.confirmacoes, true);
    assert.equal("usuarioId" in res.body, false);
    assert.equal((await api("GET", "/alertas", id)).status, 200);
  }
});
test("configuração parcial persiste sem aceitar ID alheio ou booleanos como texto", async () => {
  for (const body of [{}, { ativadas: "false" }, { usuarioId: operador, ativadas: false }, { naoExiste: true }]) assert.equal((await api("PATCH", "/preferencias", aluno, body)).status, 400);
  assert.equal((await api("PATCH", "/preferencias", aluno, { confirmacoes: false })).status, 200);
  const pref = (await api("GET", "/preferencias")).body;
  assert.equal(pref.confirmacoes, false); assert.equal(pref.carteira, true);
  assert.equal((await api("GET", "/preferencias", operador)).body.confirmacoes, true);
});
test("tema desligado mantém histórico e impede alerta; repetição não duplica", async () => {
  const n = await registrar("CONFIRMACOES", aluno, "confirmacao:teste");
  assert.equal(n.alertaHabilitado, false);
  assert.equal((await registrar("CONFIRMACOES", aluno, "confirmacao:teste")).id, n.id);
  const financeiro = await registrar("CARTEIRA");
  const historico = (await api("GET", "/")).body.dados;
  const alertas = (await api("GET", "/alertas")).body.dados;
  assert.equal(historico.some((r: any) => r.id === n.id), true);
  assert.equal(alertas.some((r: any) => r.id === n.id), false);
  assert.equal(alertas.some((r: any) => r.id === financeiro.id), true);
  for (const r of historico) for (const campo of ["usuarioId", "chaveDeduplicacao", "dados", "alertaHabilitado"]) assert.equal(campo in r, false);
});
test("desativação geral cancela alertas pendentes; reativação não dispara histórico antigo", async () => {
  const n = await registrar("CARTEIRA");
  const entrega = await prisma.entregaNotificacao.create({ data: { notificacaoId: n.id, canal: "PUSH", destino: "token-ficticio", chaveDeduplicacao: "entrega-teste" } });
  await api("PATCH", "/preferencias", aluno, { ativadas: false });
  assert.equal((await api("GET", "/alertas")).body.dados.length, 0);
  assert.equal((await api("GET", "/nao-lidas")).body.quantidade, 0);
  assert.equal((await prisma.entregaNotificacao.findUniqueOrThrow({ where: { id: entrega.id } })).status, "CANCELADA");
  const silenciada = await registrar("CARTEIRA");
  assert.equal(silenciada.alertaHabilitado, false);
  await api("PATCH", "/preferencias", aluno, { ativadas: true, confirmacoes: true });
  assert.equal((await api("GET", "/alertas")).body.dados.length, 0);
  const nova = await registrar("CONFIRMACOES");
  assert.equal((await api("GET", "/alertas")).body.dados[0].id, nova.id);
});
test("leitura é própria, idempotente e não afeta notificação alheia", async () => {
  const n = await registrar("CARTEIRA", motorista);
  assert.equal((await api("PATCH", `/${n.id}/lida`, aluno)).status, 404);
  assert.equal((await prisma.notificacao.findUniqueOrThrow({ where: { id: n.id } })).lidaEm, null);
  const primeiro = await api("PATCH", `/${n.id}/lida`, motorista);
  assert.equal(primeiro.status, 200);
  assert.equal((await api("PATCH", `/${n.id}/lida`, motorista)).body.lidaEm, primeiro.body.lidaEm);
  assert.equal((await api("GET", "/?somenteNaoLidas=true", motorista)).body.dados.some((r: any) => r.id === n.id), false);
  assert.equal((await api("PATCH", "/nao-e-uuid/lida")).status, 400);
  assert.equal((await api("GET", "/?limite=101")).status, 400);
});
test("origens operacionais classificam temas corretos", async () => {
  const { notificar } = await import("../src/modules/operacao/operacao.shared");
  for (const [prefixo, tema] of [["rota", "ALTERACOES_ROTA"], ["horario", "LEMBRETES"], ["cancelamento", "CANCELAMENTOS"], ["confirmacao", "CONFIRMACOES"], ["advertencia", "DISCIPLINA"], ["saldo-fila", "CARTEIRA"], ["convocacao", "OPERACAO"]]) {
    const n = await prisma.$transaction(tx => notificar(tx, aluno, `${prefixo}:integracao`, "Teste", "Teste"));
    assert.equal(n.tema, tema);
  }
});
test("publicação de aviso respeita perfil, expiração e preferências sem apagar o aviso", async () => {
  await api("PATCH", "/preferencias", aluno, { avisosOperador: false });
  const aviso = await prisma.aviso.create({ data: { titulo: "Comunicado", mensagem: "Informação", publicoPerfil: "ESTUDANTE", publicadoPorId: operador } });
  await prisma.aviso.create({ data: { titulo: "Expirado", mensagem: "Não entregar", expiraEm: new Date(0), publicadoPorId: operador } });
  await job.processarNotificacoes(); await job.processarNotificacoes();
  assert.equal(await prisma.notificacao.count({ where: { avisoId: aviso.id } }), 1);
  const n = await prisma.notificacao.findFirstOrThrow({ where: { avisoId: aviso.id } });
  assert.equal(n.usuarioId, aluno); assert.equal(n.alertaHabilitado, false);
  assert.equal((await api("GET", "/?tema=AVISOS_OPERADOR")).body.dados.length, 1);
  assert.equal((await api("GET", "/alertas?tema=AVISOS_OPERADOR")).body.dados.length, 0);
  await prisma.aviso.update({ where: { id: aviso.id }, data: { publicoPerfil: "MOTORISTA" } });
  assert.equal((await api("GET", "/?tema=AVISOS_OPERADOR")).body.dados.length, 0);
});
test("falha na transação não deixa notificação parcial", async () => {
  await assert.rejects(prisma.$transaction(async tx => {
    await service.registrarNotificacao(tx, { usuarioId: aluno, chaveDeduplicacao: "rollback", tipo: "TESTE", tema: "CARTEIRA", titulo: "Teste", mensagem: "Teste" });
    throw new Error("Falha simulada");
  }));
  assert.equal(await prisma.notificacao.count({ where: { chaveDeduplicacao: "rollback" } }), 0);
});
test("lembrete de embarque é gerado somente para viagem próxima e uma vez por horário", async () => {
  const agora = new Date();
  const ponto = await prisma.pontoParada.create({ data: { nome: "Campus", cidade: "Pelotas" } });
  const unidade = await prisma.unidadeEnsino.create({ data: { nome: "Campus", pontoParada: { connect: { id: ponto.id } }, instituicaoEnsino: { create: { nome: "Universidade", tipo: "FACULDADE" } } } });
  const e = await prisma.estudante.create({ data: { usuarioId: aluno, unidadeEnsinoId: unidade.id, matricula: "01", previsaoConclusao: new Date("2030-12-31"), statusCadastro: "APROVADO" } });
  const v = await prisma.viagem.create({ data: { data: agora, turno: "NOITE", nomeRota: "Rota", criadaPor: { connect: { id: operador } }, rota: { create: { nome: "Rota" } } } });
  const t = await prisma.trechoViagem.create({ data: { viagemId: v.id, sentido: "IDA", status: "FECHADO", saidaPrevistaEm: new Date(agora.getTime() + 20 * 60000), chegadaPrevistaEm: new Date(agora.getTime() + 80 * 60000), limiteConfirmacaoEm: agora, limiteCancelamentoEm: agora } });
  const origem = await prisma.paradaTrecho.create({ data: { trechoId: t.id, pontoParadaId: ponto.id, ordem: 1, nome: "Campus", cidade: "Pelotas" } });
  const pontoDestino = await prisma.pontoParada.create({ data: { nome: "Destino", cidade: "Pelotas" } });
  const destino = await prisma.paradaTrecho.create({ data: { trechoId: t.id, pontoParadaId: pontoDestino.id, ordem: 2, nome: "Destino", cidade: "Pelotas" } });
  const p = await prisma.participacaoTrecho.create({ data: { estudanteId: e.id, trechoId: t.id, origemId: origem.id, destinoId: destino.id, status: "CONFIRMADA", cicloConfirmacao: 1 } });
  await api("PATCH", "/preferencias", aluno, { lembretes: false });
  await job.processarNotificacoes(agora); await job.processarNotificacoes(agora);
  const lembretes = await prisma.notificacao.findMany({ where: { usuarioId: aluno, tipo: "LEMBRETE" } });
  assert.equal(lembretes.length, 1); assert.equal(lembretes[0].alertaHabilitado, false);
  await prisma.participacaoTrecho.update({ where: { id: p.id }, data: { status: "CANCELADA" } });
  await prisma.trechoViagem.update({ where: { id: t.id }, data: { saidaPrevistaEm: new Date(agora.getTime() + 25 * 60000) } });
  await job.processarNotificacoes(agora);
  assert.equal(await prisma.notificacao.count({ where: { tipo: "LEMBRETE" } }), 1);
});
