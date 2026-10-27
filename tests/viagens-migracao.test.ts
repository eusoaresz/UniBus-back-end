import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";

const inicial = readFileSync("prisma/migrations/20261018150404_initial/migration.sql", "utf8");
const migracao = readFileSync("prisma/migrations/20261027000100_viagens_rascunhos/migration.sql", "utf8");

async function inserir(db: PGlite, tabela: string, dados: Record<string, unknown>) {
  const registro = { id: randomUUID(), atualizadoEm: "2026-10-26T12:00:00Z", ...dados };
  const campos = Object.keys(registro);
  await db.query(`INSERT INTO "${tabela}" (${campos.map((c) => `"${c}"`).join(",")}) VALUES (${campos.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(registro));
  return registro.id;
}

async function preparar(db: PGlite) {
  const operador = await inserir(db, "Usuario", { nome: "Operador", cpf: "52998224725", email: "operador@example.com", telefone: "53999999999", perfil: "OPERADOR" });
  const motorista = await inserir(db, "Motorista", { usuarioId: operador, numeroCnh: "12345678901", categoriaCnh: "D", validadeCnh: "2030-01-01" });
  const veiculo = await inserir(db, "Veiculo", { identificacao: "Ônibus", placa: "ABC1D23", tipo: "ONIBUS", capacidade: 40 });
  const ponto = await inserir(db, "PontoParada", { nome: "Instituição", cidade: "Pelotas" });
  const instituicao = await inserir(db, "InstituicaoEnsino", { nome: "Instituição", tipo: "FACULDADE" });
  const unidade = await inserir(db, "UnidadeEnsino", { nome: "Campus", instituicaoEnsinoId: instituicao, pontoParadaId: ponto });
  const estudante = await inserir(db, "Estudante", { usuarioId: operador, unidadeEnsinoId: unidade, matricula: "123", previsaoConclusao: "2030-12-31" });
  const carteira = await inserir(db, "Carteira", { estudanteId: estudante, saldoCentavos: -1234, limiteCreditoCentavos: 2000 });
  const recarga = await inserir(db, "Recarga", { carteiraId: carteira, valorCentavos: 1025, formaPagamento: "PIX", chaveIdempotencia: "recarga" });
  await inserir(db, "MovimentacaoCarteira", { carteiraId: carteira, recargaId: recarga, realizadaPorId: operador, tipo: "RECARGA", valorCentavos: 1025, saldoAposCentavos: -1234, chaveIdempotencia: "credito" });
  const rota = await inserir(db, "Rota", { nome: "Centro" });
  const viagem = await inserir(db, "Viagem", { data: "2026-11-02", turno: "NOITE", nomeRota: "Centro", rotaId: rota, criadaPorId: operador, chegadaPedroPrevistaEm: "2026-11-03T02:00:00Z" });
  const ida = await inserir(db, "TrechoViagem", { viagemId: viagem, sentido: "IDA", saidaPrevistaEm: "2026-11-02T21:00:00Z", tarifaCentavos: 250 });
  const volta = await inserir(db, "TrechoViagem", { viagemId: viagem, sentido: "VOLTA", saidaPrevistaEm: "2026-11-03T01:00:00Z", status: "FECHADO" });
  const atendimento = await inserir(db, "AtendimentoTrecho", { trechoId: ida, veiculoId: veiculo, motoristaId: motorista, tipo: "PRINCIPAL", prioridade: 1, capacidade: 40 });
  const historico = await inserir(db, "AlteracaoAtendimento", { atendimentoId: atendimento, realizadaPorId: operador, motivo: "Alocação", dadosAnteriores: {}, dadosNovos: { capacidade: 40 } });
  const parada = await inserir(db, "ParadaTrecho", { trechoId: ida, pontoParadaId: ponto, ordem: 1, nome: "Instituição", cidade: "Pelotas" });
  const participacao = await inserir(db, "ParticipacaoTrecho", { trechoId: ida, estudanteId: estudante, origemId: parada, destinoId: parada, atendimentoId: atendimento });
  const embarque = await inserir(db, "Embarque", { participacaoId: participacao, atendimentoId: atendimento, motoristaId: motorista, veiculoId: veiculo, registradoPorId: operador, chaveIdempotencia: "embarque" });
  await inserir(db, "MovimentacaoCarteira", { carteiraId: carteira, embarqueId: embarque, realizadaPorId: operador, tipo: "COBRANCA_EMBARQUE", valorCentavos: -250, saldoAposCentavos: -1484, chaveIdempotencia: "debito" });
  await inserir(db, "IndisponibilidadeMotorista", { atendimentoId: atendimento, motoristaId: motorista, motivo: "Indisponibilidade" });
  return { ida, volta, historico, motorista, veiculo, atendimento, participacao, operador, carteira };
}

async function horarios(db: PGlite, ida: string) {
  await db.exec('CREATE TABLE "_ViagemHorariosMigracao" ("trechoId" UUID PRIMARY KEY, "saidaPrevistaEm" TIMESTAMPTZ(3), "chegadaPrevistaEm" TIMESTAMPTZ(3) NOT NULL)');
  await db.query('INSERT INTO "_ViagemHorariosMigracao" VALUES ($1, NULL, $2)', [ida, "2026-11-02T22:00:00Z"]);
}

test("migração em banco vazio corresponde às colunas, relações e índices do schema", async () => {
  const db = new PGlite();
  const esperado = new PGlite();
  try {
    await db.exec(inicial);
    await db.exec(migracao);
    const sql = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"], {
      encoding: "utf8", env: { ...process.env, DATABASE_URL: "postgresql://test:test@localhost:5432/test" }, timeout: 60000,
    });
    assert.equal(sql.status, 0, sql.stderr);
    await esperado.exec(sql.stdout);
    for (const consulta of [
      "SELECT table_name, column_name, is_nullable, udt_name, numeric_precision, numeric_scale FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, column_name",
      "SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname",
      "SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace ORDER BY conname",
    ]) {
      assert.deepEqual((await db.query(consulta)).rows, (await esperado.query(consulta)).rows);
    }
  } finally {
    await db.close(); await esperado.close();
  }
});

test("migração preserva dinheiro, alocações, embarques e históricos existentes", async () => {
  const db = new PGlite();
  try {
    await db.exec(inicial);
    const ids = await preparar(db);
    await horarios(db, ids.ida);
    await db.exec(migracao);
    assert.deepEqual((await db.query('SELECT saldo::text, "limiteCredito"::text FROM "Carteira"')).rows, [{ saldo: "-12.34", limiteCredito: "20.00" }]);
    assert.deepEqual((await db.query('SELECT valor::text FROM "Recarga"')).rows, [{ valor: "10.25" }]);
    assert.deepEqual((await db.query('SELECT tipo, valor::text, "saldoApos"::text FROM "MovimentacaoCarteira" ORDER BY valor')).rows, [
      { tipo: "COBRANCA_EMBARQUE", valor: "-2.50", saldoApos: "-14.84" },
      { tipo: "RECARGA", valor: "10.25", saldoApos: "-12.34" },
    ]);
    const ida = (await db.query<any>('SELECT * FROM "TrechoViagem" WHERE id=$1', [ids.ida])).rows[0];
    assert.equal(ida.tarifa, "2.50");
    assert.equal(ida.motoristaId, ids.motorista);
    assert.equal(ida.veiculoId, ids.veiculo);
    assert.equal(ida.capacidade, 40);
    assert.equal((await db.query<any>('SELECT "inscricoesSuspensas" FROM "TrechoViagem" WHERE id=$1', [ids.volta])).rows[0].inscricoesSuspensas, true);
    assert.equal((await db.query<any>('SELECT alocacao FROM "ParticipacaoTrecho"')).rows[0].alocacao, "VEICULO");
    assert.equal((await db.query<any>('SELECT "trechoId" FROM "IndisponibilidadeMotorista"')).rows[0].trechoId, ids.ida);
    assert.equal((await db.query<any>('SELECT count(*)::int AS total FROM "Embarque"')).rows[0].total, 1);
    const historico = (await db.query<any>('SELECT * FROM "AlteracaoTrecho" WHERE id=$1', [ids.historico])).rows[0];
    assert.equal(historico.dadosAnteriores.atendimentoMigrado.id, ids.atendimento);
    assert.equal(historico.realizadaPorId, ids.operador);
    const snapshot = (await db.query<any>('SELECT "dadosAnteriores", "realizadaPorId" FROM "AlteracaoTrecho" WHERE "trechoId"=$1 AND "realizadaPorId" IS NULL', [ids.ida])).rows[0];
    assert.equal(snapshot.dadosAnteriores.trecho.tarifaCentavos, 250);
    assert.equal(snapshot.dadosAnteriores.embarques[0].atendimentoId, ids.atendimento);
    assert.equal(snapshot.realizadaPorId, null);
    await assert.rejects(db.exec(`UPDATE "TrechoViagem" SET "chegadaPrevistaEm" = "saidaPrevistaEm"`));
    await assert.rejects(db.exec('UPDATE "TrechoViagem" SET capacidade = 0'));
  } finally { await db.close(); }
});

test("horários ausentes interrompem a migração sem converter parcialmente os valores", async () => {
  const db = new PGlite();
  try {
    await db.exec(inicial);
    const ids = await preparar(db);
    await assert.rejects(db.exec(migracao), /horários válidos/);
    await db.exec("ROLLBACK");
    assert.equal((await db.query<any>('SELECT "saldoCentavos" FROM "Carteira"')).rows[0].saldoCentavos, -1234);
    assert.equal((await db.query<any>('SELECT count(*)::int AS total FROM "AtendimentoTrecho"')).rows[0].total, 1);
    await horarios(db, ids.ida);
    await db.exec(migracao);
    assert.equal((await db.query<any>('SELECT saldo::text FROM "Carteira"')).rows[0].saldo, "-12.34");
  } finally { await db.close(); }
});

test("migração rejeita duas alocações normais para o mesmo trecho", async () => {
  const db = new PGlite();
  try {
    await db.exec(inicial);
    const ids = await preparar(db);
    await horarios(db, ids.ida);
    await inserir(db, "AtendimentoTrecho", { trechoId: ids.ida, veiculoId: ids.veiculo, motoristaId: ids.motorista, tipo: "PRINCIPAL", prioridade: 2, capacidade: 40 });
    await assert.rejects(db.exec(migracao), /múltiplas alocações/);
    await db.exec("ROLLBACK");
    assert.equal((await db.query<any>('SELECT count(*)::int AS total FROM "AtendimentoTrecho"')).rows[0].total, 2);
  } finally { await db.close(); }
});
