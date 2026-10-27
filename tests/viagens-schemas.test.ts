import { test } from "node:test";
import assert from "node:assert/strict";
import { criarViagemRascunhoSchema } from "../src/modules/viagens/viagens.schemas";

const base = {
  data: "2026-10-26",
  turno: "NOITE",
  rotaId: "00000000-0000-4000-8000-000000000001",
  trechos: [
    { sentido: "IDA", saidaPrevistaEm: "2026-10-26T18:00:00-03:00", chegadaPrevistaEm: "2026-10-26T19:00:00-03:00" },
    { sentido: "VOLTA", saidaPrevistaEm: "2026-10-26T22:30:00-03:00", chegadaPrevistaEm: "2026-10-26T23:30:00-03:00" },
  ],
};

function alterarTrecho(indice: number, dados: Record<string, unknown>) {
  return { ...base, trechos: base.trechos.map((trecho, i) => i === indice ? { ...trecho, ...dados } : trecho) };
}

test("aceita rascunho completo sem motorista ou veículo", () => {
  assert.equal(criarViagemRascunhoSchema.safeParse(base).success, true);
});

test("aceita todos os turnos previstos", () => {
  for (const turno of ["MANHA", "TARDE", "NOITE"]) {
    assert.equal(criarViagemRascunhoSchema.safeParse({ ...base, turno }).success, true);
  }
});

test("exige exatamente ida e volta, sem duplicação", () => {
  for (const trechos of [[], [base.trechos[0]], [base.trechos[1]],
    [base.trechos[0], base.trechos[0]], [base.trechos[1], base.trechos[1]],
    [...base.trechos, base.trechos[0]]]) {
    assert.equal(criarViagemRascunhoSchema.safeParse({ ...base, trechos }).success, false);
  }
});

test("aceita trechos enviados em ordem invertida", () => {
  assert.equal(criarViagemRascunhoSchema.safeParse({ ...base, trechos: [...base.trechos].reverse() }).success, true);
});

test("rejeita data inexistente, turno inválido, rota inválida e sentido desconhecido", () => {
  for (const campo of [{ data: "2026-02-30" }, { turno: "MADRUGADA" }, { rotaId: "123" }]) {
    assert.equal(criarViagemRascunhoSchema.safeParse({ ...base, ...campo }).success, false);
  }
  assert.equal(criarViagemRascunhoSchema.safeParse(alterarTrecho(0, { sentido: "OUTRO" })).success, false);
});

test("exige saída e chegada em ambos os trechos", () => {
  for (const indice of [0, 1]) {
    for (const campo of ["saidaPrevistaEm", "chegadaPrevistaEm"]) {
      for (const valor of [undefined, null, ""]) {
        assert.equal(criarViagemRascunhoSchema.safeParse(alterarTrecho(indice, { [campo]: valor })).success, false);
      }
    }
  }
});

test("rejeita campos controlados pelo servidor", () => {
  for (const campo of [{ status: "PROGRAMADA" }, { criadaPorId: base.rotaId }, { nomeRota: "Outra rota" }]) {
    assert.equal(criarViagemRascunhoSchema.safeParse({ ...base, ...campo }).success, false);
  }
  for (const campo of [{ tarifaCentavos: 0 }, { tarifa: "0.00" }, { inscricoesSuspensas: false }, { status: "ABERTO" },
    { limiteConfirmacaoEm: base.trechos[0].saidaPrevistaEm },
    { limiteCancelamentoEm: base.trechos[0].saidaPrevistaEm }]) {
    assert.equal(criarViagemRascunhoSchema.safeParse(alterarTrecho(0, campo)).success, false);
  }
});

test("exige fuso explícito e data válida nos horários", () => {
  for (const indice of [0, 1]) {
    for (const campo of ["saidaPrevistaEm", "chegadaPrevistaEm"]) {
      for (const valor of ["2026-10-26T18:00:00", "2026-02-30T18:00:00-03:00", "horário inválido"]) {
        assert.equal(criarViagemRascunhoSchema.safeParse(alterarTrecho(indice, { [campo]: valor })).success, false);
      }
    }
  }
});

test("rejeita chegada anterior ou igual à saída em cada trecho", () => {
  for (const indice of [0, 1]) {
    const saida = Date.parse(base.trechos[indice].saidaPrevistaEm);
    for (const diferenca of [0, -60000]) {
      const resultado = criarViagemRascunhoSchema.safeParse(alterarTrecho(indice, {
        chegadaPrevistaEm: new Date(saida + diferenca).toISOString(),
      }));
      assert.equal(resultado.success, false);
      if (!resultado.success) {
        assert.ok(resultado.error.issues.some((issue) => issue.path.join(".") === `trechos.${indice}.chegadaPrevistaEm`));
      }
    }
  }
});

test("impede sobreposição sem exigir 120 minutos entre ida e volta", () => {
  assert.equal(criarViagemRascunhoSchema.safeParse(alterarTrecho(1, {
    saidaPrevistaEm: "2026-10-26T18:30:00-03:00",
  })).success, false);
  for (const saidaPrevistaEm of ["2026-10-26T19:00:00-03:00", "2026-10-26T19:01:00-03:00"]) {
    assert.equal(criarViagemRascunhoSchema.safeParse(alterarTrecho(1, { saidaPrevistaEm })).success, true);
  }
});

test("aceita volta e chegada no dia seguinte", () => {
  assert.equal(criarViagemRascunhoSchema.safeParse(alterarTrecho(1, {
    saidaPrevistaEm: "2026-10-27T00:30:00-03:00",
    chegadaPrevistaEm: "2026-10-27T01:30:00-03:00",
  })).success, true);
});

test("compara a ordem de ida e volta pelo instante, mesmo com fusos diferentes", () => {
  for (const saidaPrevistaEm of ["2026-10-26T20:00:00Z", "2026-10-26T21:00:00Z"]) {
    assert.equal(criarViagemRascunhoSchema.safeParse(alterarTrecho(1, { saidaPrevistaEm })).success, false);
  }
  assert.equal(criarViagemRascunhoSchema.safeParse(alterarTrecho(1, {
    saidaPrevistaEm: "2026-10-27T01:30:00Z", chegadaPrevistaEm: "2026-10-27T02:30:00Z",
  })).success, true);
});
