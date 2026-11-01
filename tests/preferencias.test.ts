import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { atualizarPreferenciasSchema } from "../src/modules/preferencias/preferencias.schemas";
import { preferenciasDto, preferenciasSelect } from "../src/modules/preferencias/preferencias.dto";
import { Prisma } from "../generated/prisma";
let prisma: typeof import("../lib/prisma").prisma;
let service: typeof import("../src/modules/preferencias/preferencias.service");
import { HttpError } from "../src/shared/errors/http-error";

const rotaId = "00000000-0000-4000-8000-000000000001";
const cidadeId = "00000000-0000-4000-8000-000000000002";
const usuarioA = "00000000-0000-4000-8000-000000000011";
const usuarioB = "00000000-0000-4000-8000-000000000012";
const rotaInativa = "00000000-0000-4000-8000-000000000021";
const cidadeInativa = "00000000-0000-4000-8000-000000000022";

const preferencias = new Map<string, { id: string; turnos: string[]; rotaIds: string[]; cidadeIds: string[] }>();
let conflitoRestante = 0;
let falharPersistencia = false;
const originais: Array<{ alvo: object; chave: string; valor: unknown }> = [];

function substituir(alvo: object, chave: string, valor: unknown) {
  originais.push({ alvo, chave, valor: (alvo as Record<string, unknown>)[chave] });
  (alvo as Record<string, unknown>)[chave] = valor;
}

function registro(usuarioId: string, dados: { turnos: string[]; rotaIds: string[]; cidadeIds: string[] }) {
  return {
    id: `pref-${usuarioId}`,
    turnos: dados.turnos,
    rotas: dados.rotaIds.map((id) => ({ rota: { id, nome: id === rotaId ? "Centro" : "Inativa", descricao: null, ativa: id !== rotaInativa } })),
    cidades: dados.cidadeIds.map((id) => ({ cidade: { id, nome: id === cidadeId ? "Pelotas" : "Inativa", ativa: id !== cidadeInativa } })),
  };
}

before(async () => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  prisma = (await import("../lib/prisma")).prisma;
  service = await import("../src/modules/preferencias/preferencias.service");
  substituir(prisma.rota, "findMany", async (args: any) => {
    const ids = args.where?.id?.in;
    const ativos = args.where?.ativa === true;
    const itens = [
      { id: rotaId, nome: "Centro", descricao: null, ativa: true },
      { id: rotaInativa, nome: "Inativa", descricao: null, ativa: false },
    ].filter((item) => (!ids || ids.includes(item.id)) && (!ativos || item.ativa));
    return args.select?.descricao ? itens : itens.map(({ id, nome }) => ({ id, nome }));
  });
  substituir(prisma.cidade, "findMany", async (args: any) => {
    const ids = args.where?.id?.in;
    const ativos = args.where?.ativa === true;
    const itens = [
      { id: cidadeId, nome: "Pelotas", ativa: true },
      { id: cidadeInativa, nome: "Inativa", ativa: false },
    ].filter((item) => (!ids || ids.includes(item.id)) && (!ativos || item.ativa));
    return itens.map(({ id, nome }) => ({ id, nome }));
  });
  substituir(prisma as object, "$transaction", async function (callback: any) {
    if (conflitoRestante > 0) {
      conflitoRestante--;
      throw { code: "P2034" };
    }
    const tx = {
      rota: prisma.rota,
      cidade: prisma.cidade,
      preferencias: {
        upsert: async (args: any) => {
          const usuarioId = args.where.usuarioId;
          const payload = args.data ?? args;
          const anterior = preferencias.get(usuarioId);
          const dados = anterior
            ? {
                turnos: payload.update.turnos ?? anterior.turnos,
                rotaIds: payload.update.rotas?.create?.map((item: any) => item.rota.connect.id) ?? anterior.rotaIds,
                cidadeIds: payload.update.cidades?.create?.map((item: any) => item.cidade.connect.id) ?? anterior.cidadeIds,
              }
            : {
                turnos: payload.create.turnos,
                rotaIds: (payload.create.rotas?.create ?? []).map((item: any) => item.rota.connect.id),
                cidadeIds: (payload.create.cidades?.create ?? []).map((item: any) => item.cidade.connect.id),
              };
          if (falharPersistencia) throw new Error("falha simulada");
          preferencias.set(usuarioId, { id: `pref-${usuarioId}`, ...dados });
          return registro(usuarioId, dados);
        },
      },
    };
    return callback(tx);
  });
});

after(() => {
  for (const original of originais.reverse()) {
    (original.alvo as Record<string, unknown>)[original.chave] = original.valor;
  }
});

test("aceita atualização completa de preferências", () => {
  const resultado = atualizarPreferenciasSchema.safeParse({
    rotaIds: [rotaId],
    turnos: ["MANHA", "NOITE"],
    cidadeIds: [cidadeId],
  });
  assert.equal(resultado.success, true);
});

test("aceita atualização parcial e rejeita payload vazio ou campos desconhecidos", () => {
  assert.deepEqual(atualizarPreferenciasSchema.parse({ turnos: ["TARDE"] }), { turnos: ["TARDE"] });
  assert.equal(atualizarPreferenciasSchema.safeParse({}).success, false);
  assert.equal(atualizarPreferenciasSchema.safeParse({ rotaIds: [rotaId], nome: "invalido" }).success, false);
});

test("rejeita duplicidades e identificadores inválidos", () => {
  assert.equal(atualizarPreferenciasSchema.safeParse({ rotaIds: [rotaId, rotaId] }).success, false);
  assert.equal(atualizarPreferenciasSchema.safeParse({ rotaIds: ["rota-invalida"] }).success, false);
  assert.equal(atualizarPreferenciasSchema.safeParse({ turnos: ["MADRUGADA"] }).success, false);
});

test("serializa preferências sem criar vínculo com viagem", () => {
  const preferencias: Prisma.PreferenciasGetPayload<{ select: typeof preferenciasSelect }> = {
    id: "00000000-0000-4000-8000-000000000003",
    turnos: ["NOITE"],
    rotas: [{ rota: { id: rotaId, nome: "Centro", descricao: null, ativa: true } }],
    cidades: [{ cidade: { id: cidadeId, nome: "Pelotas", ativa: true } }],
  };
  const resposta = preferenciasDto(preferencias);
  assert.deepEqual(resposta, {
    id: "00000000-0000-4000-8000-000000000003",
    rotaIds: [rotaId],
    rotas: [{ id: rotaId, nome: "Centro", descricao: null, ativa: true }],
    turnos: ["NOITE"],
    cidadeIds: [cidadeId],
    cidades: [{ id: cidadeId, nome: "Pelotas", ativa: true }],
  });
});

test("consulta opções retorna somente catálogo ativo e os turnos", async () => {
  assert.deepEqual(await service.opcoes(), {
    rotas: [{ id: rotaId, nome: "Centro" }],
    cidades: [{ id: cidadeId, nome: "Pelotas" }],
    turnos: ["MANHA", "TARDE", "NOITE"],
  });
});

test("salva, edita parcialmente e limpa listas com [] sem misturar usuários", async () => {
  await service.atualizar(usuarioA, { rotaIds: [rotaId], turnos: ["MANHA"], cidadeIds: [cidadeId] });
  await service.atualizar(usuarioA, { turnos: ["NOITE"] });
  assert.deepEqual(preferencias.get(usuarioA), {
    id: `pref-${usuarioA}`, rotaIds: [rotaId], turnos: ["NOITE"], cidadeIds: [cidadeId],
  });
  await service.atualizar(usuarioA, { rotaIds: [], cidadeIds: [] });
  await service.atualizar(usuarioB, { rotaIds: [rotaId], turnos: ["TARDE"], cidadeIds: [] });
  assert.deepEqual(preferencias.get(usuarioA)?.rotaIds, []);
  assert.deepEqual(preferencias.get(usuarioA)?.cidadeIds, []);
  assert.deepEqual(preferencias.get(usuarioB)?.rotaIds, [rotaId]);
});

test("rejeita registros inativos antes de persistir", async () => {
  await assert.rejects(
    service.atualizar(usuarioA, { rotaIds: [rotaInativa] }),
    (erro: unknown) => erro instanceof HttpError && erro.status === 400,
  );
  assert.deepEqual(preferencias.get(usuarioA)?.rotaIds, []);
  await assert.rejects(
    service.atualizar(usuarioA, { cidadeIds: [cidadeInativa] }),
    (erro: unknown) => erro instanceof HttpError && erro.status === 400,
  );
});

test("mantém o estado anterior quando a persistência falha", async () => {
  await service.atualizar(usuarioA, { turnos: ["MANHA"] });
  falharPersistencia = true;
  await assert.rejects(service.atualizar(usuarioA, { turnos: ["TARDE"] }), /falha simulada/);
  falharPersistencia = false;
  assert.deepEqual(preferencias.get(usuarioA)?.turnos, ["MANHA"]);
});

test("conflito P2034 é repetido e retorna 409 quando persiste", async () => {
  conflitoRestante = 2;
  await service.atualizar(usuarioA, { turnos: ["NOITE"] });
  conflitoRestante = 3;
  await assert.rejects(
    service.atualizar(usuarioA, { turnos: ["TARDE"] }),
    (erro: unknown) => erro instanceof HttpError && erro.status === 409,
  );
  assert.deepEqual(preferencias.get(usuarioA)?.turnos, ["NOITE"]);
});
