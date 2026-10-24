import { test } from "node:test";
import assert from "node:assert/strict";
import { criarViagemRascunhoSchema } from "../src/modules/viagens/viagens.schemas";

const base = {
  data: "2026-10-26",
  turno: "NOITE",
  rotaId: "00000000-0000-4000-8000-000000000001",
  trechos: [{ sentido: "IDA" }, { sentido: "VOLTA" }],
};

test("rascunho aceita trechos ainda sem horário, motorista ou veículo", () => {
  assert.equal(criarViagemRascunhoSchema.safeParse(base).success, true);
});

test("rascunho aceita apenas um sentido", () => {
  assert.equal(criarViagemRascunhoSchema.safeParse({ ...base, trechos: [{ sentido: "IDA" }] }).success, true);
});

test("rejeita data inexistente, turno inválido e identificador de rota inválido", () => {
  for (const campo of [{ data: "2026-02-30" }, { turno: "MADRUGADA" }, { rotaId: "123" }]) {
    assert.equal(criarViagemRascunhoSchema.safeParse({ ...base, ...campo }).success, false);
  }
});

test("exige ao menos um trecho e impede sentidos duplicados", () => {
  for (const trechos of [[], [{ sentido: "IDA" }, { sentido: "IDA" }], [{ sentido: "OUTRO" }]]) {
    assert.equal(criarViagemRascunhoSchema.safeParse({ ...base, trechos }).success, false);
  }
});

test("rejeita campos controlados pelo servidor", () => {
  for (const campo of [{ status: "PROGRAMADA" }, { criadaPorId: base.rotaId }, { nomeRota: "Outra rota" }]) {
    assert.equal(criarViagemRascunhoSchema.safeParse({ ...base, ...campo }).success, false);
  }
  assert.equal(criarViagemRascunhoSchema.safeParse({ ...base, trechos: [{ sentido: "IDA", tarifaCentavos: 0 }] }).success, false);
});

test("horário informado exige fuso explícito", () => {
  assert.equal(criarViagemRascunhoSchema.safeParse({ ...base, trechos: [{ sentido: "IDA", saidaPrevistaEm: "2026-10-26T18:00:00" }] }).success, false);
});

test("aceita volta após meia-noite e compara horários pelo instante real", () => {
  assert.equal(criarViagemRascunhoSchema.safeParse({ ...base, trechos: [
    { sentido: "IDA", saidaPrevistaEm: "2026-10-26T18:00:00-03:00" },
    { sentido: "VOLTA", saidaPrevistaEm: "2026-10-27T00:30:00-03:00" },
  ] }).success, true);
  assert.equal(criarViagemRascunhoSchema.safeParse({ ...base, trechos: [
    { sentido: "IDA", saidaPrevistaEm: "2026-10-26T18:00:00-03:00" },
    { sentido: "VOLTA", saidaPrevistaEm: "2026-10-26T20:00:00Z" },
  ] }).success, false);
});

test("rejeita ida e volta no mesmo instante", () => {
  assert.equal(criarViagemRascunhoSchema.safeParse({ ...base, trechos: [
    { sentido: "IDA", saidaPrevistaEm: "2026-10-26T18:00:00-03:00" },
    { sentido: "VOLTA", saidaPrevistaEm: "2026-10-26T21:00:00Z" },
  ] }).success, false);
});
