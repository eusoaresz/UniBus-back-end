import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { Prisma } from "../generated/prisma";

process.env.JWT_SECRET = "segredo-exclusivo-dos-testes-sem-uso-real";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.MAILTRAP_USER = "test";
process.env.MAILTRAP_PASS = "test";
process.env.SMTP_FROM = "test@example.com";

const operadorId = "00000000-0000-4000-8000-000000000001";
const usuarioId = "00000000-0000-4000-8000-000000000002";
const estudanteId = "00000000-0000-4000-8000-000000000003";
const unidadeId = "00000000-0000-4000-8000-000000000004";
const data = new Date("2026-10-31T12:00:00Z");
let server: Server;
let base: string;
let prisma: typeof import("../lib/prisma").prisma;
let perfil: string;
let estudante: any;
let unidadeAtiva: boolean;
let conflito: boolean;
let erroPersistencia: boolean;
let atualizacoes: any[];
let filtrosComprovantes: any;
let metadados: any;
let salvos: number;
let removidos: number;
let jaCadastrado: boolean;
let ultimoCadastro: any;
let criacoesCarteira: number;
const restaurar: Array<() => void> = [];

function selecionar(registro: any, select: any): any {
  if (!registro) return null;
  return Object.fromEntries(Object.entries(select).map(([campo, valor]: [string, any]) => [
    campo, valor === true ? registro[campo] : selecionar(registro[campo], valor.select),
  ]));
}
before(async () => {
  prisma = (await import("../lib/prisma")).prisma;
  const { comprovantesStorage } = await import("../src/shared/storage/comprovantes.storage");
  function substituir(alvo: any, campo: string, valor: any) {
    const original = alvo[campo]; alvo[campo] = valor;
    restaurar.push(() => { alvo[campo] = original; });
  }
  substituir(prisma.tokenRevogado, "findUnique", async () => null);
  substituir(prisma.usuario, "findUnique", async (args: any) => {
    if (args.where.id === operadorId) return { id: operadorId, perfil, status: "ATIVA", email: "auth@example.com" };
    return { id: usuarioId, perfil: "ESTUDANTE", estudante: jaCadastrado ? { id: estudanteId } : null };
  });
  substituir(prisma.estudante, "findUnique", async (args: any) => {
    const existe = estudante && (args.where.id === estudanteId || args.where.usuarioId === operadorId);
    return existe ? selecionar(estudante, args.select) : null;
  });
  substituir(prisma.estudante, "findFirst", async () => null);
  substituir(prisma.estudante, "findMany", async () => [selecionar(estudante, (await import("../src/modules/estudantes/estudantes.dto")).estudanteListaSelect)]);
  substituir(prisma.estudante, "create", async (args: any) => {
    if (jaCadastrado) throw { code: "P2002" };
    ultimoCadastro = args.data;
    const { usuario, carteira, unidadeEnsino, analisadoPor, ...campos } = args.data;
    estudante = {
      ...estudante, ...campos,
      usuario: { ...estudante.usuario, ...usuario.create, status: "AGUARDANDO_ATIVACAO" },
      unidadeEnsinoId: unidadeEnsino.connect.id,
      analisadoPor: { id: analisadoPor.connect.id, nome: "Operador" },
      carteira: carteira ? { id: "carteira", saldo: new Prisma.Decimal(0), limiteCredito: new Prisma.Decimal(20) } : null,
    };
    return selecionar(estudante, args.select);
  });
  substituir(prisma.estudante, "update", async (args: any) => {
    atualizacoes.push(args);
    for (const [campo, valor] of Object.entries(args.data)) if (valor !== undefined) estudante[campo] = valor;
    return selecionar(estudante, args.select);
  });
  substituir(prisma.estudante, "updateMany", async (args: any) => {
    if (conflito || args.where.statusCadastro !== estudante.statusCadastro) return { count: 0 };
    atualizacoes.push(args); Object.assign(estudante, args.data); return { count: 1 };
  });
  substituir(prisma.unidadeEnsino, "findUnique", async () => ({
    id: unidadeId, ativa: unidadeAtiva && estudante.unidadeEnsino.ativa,
    instituicaoEnsino: { ativa: estudante.unidadeEnsino.instituicaoEnsino.ativa },
    pontoParada: { ativo: true },
  }));
  substituir(prisma.carteira, "upsert", async (args: any) => {
    assert.deepEqual(args.where, { estudanteId });
    assert.deepEqual(args.update, {});
    if (!estudante.carteira) {
      criacoesCarteira++;
      estudante.carteira = { id: "carteira", saldo: new Prisma.Decimal(0), limiteCredito: new Prisma.Decimal(20) };
    }
    return estudante.carteira;
  });
  substituir(prisma.comprovanteMatricula, "findMany", async (args: any) => { filtrosComprovantes = args; return []; });
  substituir(prisma.comprovanteMatricula, "create", async (args: any) => {
    if (erroPersistencia) throw new Error("Falha simulada");
    metadados = args.data;
    return { ...args.data, id: estudanteId, criadoEm: data, atualizadoEm: data };
  });
  substituir(prisma, "$transaction", async (fn: any) => fn(prisma));
  substituir(prisma.alteracaoPerfil, "create", async (args: any) => args.data);
  substituir(comprovantesStorage, "salvar", async () => {
    salvos++; return { chave: "chave-privada", remover: async () => { removidos++; } };
  });
  const app = (await import("../src/app")).default;
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/estudantes`;
});
beforeEach(() => {
  perfil = "OPERADOR"; conflito = false; unidadeAtiva = true; jaCadastrado = false;
  erroPersistencia = false; salvos = 0; removidos = 0; atualizacoes = []; metadados = undefined;
  ultimoCadastro = undefined; criacoesCarteira = 0;
  estudante = {
    id: estudanteId, usuarioId, unidadeEnsinoId: unidadeId, matricula: "001", previsaoConclusao: new Date("2028-12-31T00:00:00Z"),
    statusCadastro: "PENDENTE", analisadoEm: null, observacaoAnalise: null, analisadoPor: null,
    criadoEm: data, atualizadoEm: data,
    carteira: null,
    usuario: { id: usuarioId, nome: "Estudante", email: "teste@example.com", telefone: "53991234567", perfil: "ESTUDANTE", status: "ATIVA" },
    unidadeEnsino: { id: unidadeId, nome: "Campus", endereco: null, ativa: true,
      instituicaoEnsino: { id: unidadeId, nome: "Instituição", tipo: "FACULDADE", ativa: true } },
  };
});
after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  restaurar.reverse().forEach((fn) => fn()); await prisma?.$disconnect();
});
function request(method: string, path = "", body?: unknown, token = true) {
  return fetch(base + path, { method, headers: {
    ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${jwt.sign({ id: operadorId }, process.env.JWT_SECRET!, { expiresIn: "1h" })}` } : {}),
  }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
}
function upload(conteudo = Buffer.from("%PDF-1.7\nconteudo de teste\n%%EOF"), tipo = "application/pdf") {
  const form = new FormData(); form.append("arquivo", new Blob([new Uint8Array(conteudo)], { type: tipo }), "matricula.pdf"); return form;
}

test("rotas estão montadas e exigem autenticação", async () => {
  assert.equal((await request("GET", "", undefined, false)).status, 401);
});
test("estudante consulta somente seu perfil e não acessa gestão", async () => {
  perfil = "ESTUDANTE";
  assert.equal((await request("GET", "/me")).status, 200);
  assert.equal((await request("GET")).status, 403);
  assert.equal((await request("GET", `/${estudanteId}`)).status, 403);
});
test("operador e motorista não usam rotas próprias de estudante", async () => {
  for (const valor of ["OPERADOR", "MOTORISTA"]) {
    perfil = valor; assert.equal((await request("GET", "/me")).status, 403);
    assert.equal((await request("POST", "/me/comprovantes", upload())).status, 403);
  }
});
test("cadastro cria usuário, estudante aprovado e carteira sem aceitar campos administrativos", async () => {
  const dados = {
    nome: "Estudante Teste", cpf: "52998224725", email: "novo@example.com",
    telefone: "53991234567", senha: "SenhaTeste123!",
    unidadeEnsinoId: unidadeId, matricula: "002", previsaoConclusao: "2028-12-31",
  };
  assert.equal((await request("POST", "", { ...dados, statusCadastro: "APROVADO" })).status, 400);
  assert.equal((await request("POST", "", { ...dados, usuarioId })).status, 400);
  const res = await request("POST", "", dados);
  assert.equal(res.status, 201, await res.clone().text());
  const body = await res.json() as any;
  assert.equal(body.statusCadastro, "APROVADO");
  assert.deepEqual(body.carteira, { id: "carteira", saldo: "0.00", limiteCredito: "20.00" });
  assert.equal(ultimoCadastro.usuario.create.perfil, "ESTUDANTE");
  assert.equal(ultimoCadastro.usuario.create.cadastradoPorId, operadorId);
  assert.equal(await bcrypt.compare(dados.senha, ultimoCadastro.usuario.create.senhaHash), true);
  assert.equal("senha" in ultimoCadastro.usuario.create, false);
  assert.equal("senhaHash" in body.usuario, false);
  assert.equal("cpf" in body.usuario, false);
  jaCadastrado = true; assert.equal((await request("POST", "", dados)).status, 409);
});
test("aprovação registra operador e impede repetição", async () => {
  assert.equal((await request("POST", `/${estudanteId}/aprovar`, { motivo: "Aprovação presencial" })).status, 200);
  assert.equal(atualizacoes[0].where.statusCadastro, "PENDENTE");
  assert.equal(atualizacoes[0].data.analisadoPorId, operadorId);
  assert.equal(criacoesCarteira, 1);
  assert.equal((await request("POST", `/${estudanteId}/aprovar`, { motivo: "Aprovação presencial" })).status, 409);
});
test("conflito entre leitura e transição não sobrescreve status", async () => {
  conflito = true;
  assert.equal((await request("POST", `/${estudanteId}/aprovar`, { motivo: "Aprovação presencial" })).status, 409);
  assert.equal(estudante.statusCadastro, "PENDENTE");
});
test("não aprova cadastro vinculado a unidade inativa", async () => {
  estudante.unidadeEnsino.ativa = false;
  assert.equal((await request("POST", `/${estudanteId}/aprovar`, { motivo: "Aprovação presencial" })).status, 409);
  assert.equal(atualizacoes.length, 0);
});
test("rejeição exige motivo e suspensão exige aprovação anterior", async () => {
  assert.equal((await request("POST", `/${estudanteId}/rejeitar`, {})).status, 400);
  assert.equal((await request("POST", `/${estudanteId}/suspender`, { motivo: "Motivo de teste" })).status, 409);
  assert.equal((await request("POST", `/${estudanteId}/rejeitar`, { motivo: "Dados incorretos" })).status, 200);
});
test("reativação é exclusiva de suspensos e retorna a aprovado", async () => {
  estudante.statusCadastro = "REJEITADO";
  assert.equal((await request("POST", `/${estudanteId}/reativar`, { motivo: "Regularização" })).status, 409);
  estudante.statusCadastro = "SUSPENSO";
  estudante.carteira = { id: "carteira", saldo: new Prisma.Decimal("12.50"), limiteCredito: new Prisma.Decimal(20) };
  assert.equal((await request("POST", `/${estudanteId}/reativar`, { motivo: "Regularização" })).status, 200);
  assert.equal(estudante.statusCadastro, "APROVADO");
  assert.equal(estudante.carteira.saldo.toFixed(2), "12.50");
  assert.equal(criacoesCarteira, 0);
});
test("edição converte data e impede unidade inativa", async () => {
  assert.equal((await request("PATCH", `/${estudanteId}`, { previsaoConclusao: "2029-12-31", motivo: "Correção" })).status, 200);
  assert.equal(estudante.previsaoConclusao.toISOString(), "2029-12-31T00:00:00.000Z");
  unidadeAtiva = false;
  assert.equal((await request("PATCH", `/${estudanteId}`, { unidadeEnsinoId: unidadeId, motivo: "Correção" })).status, 409);
});
test("comprovantes são paginados e limitados ao cadastro autenticado", async () => {
  perfil = "ESTUDANTE";
  const res = await request("GET", "/me/comprovantes?pagina=2&limite=5");
  assert.equal(res.status, 200);
  assert.deepEqual(filtrosComprovantes.where, { estudanteId });
  assert.equal(filtrosComprovantes.skip, 5); assert.equal(filtrosComprovantes.take, 6);
});
test("upload detecta tipo pelos bytes, salva e não expõe chave", async () => {
  perfil = "ESTUDANTE";
  const res = await request("POST", "/me/comprovantes", upload(undefined, "text/html"));
  assert.equal(res.status, 201, await res.clone().text());
  assert.equal(metadados.tipoMime, "application/pdf");
  assert.equal(metadados.enviadoPorId, operadorId);
  assert.equal(metadados.estudanteId, estudanteId);
  assert.equal(salvos, 1); assert.equal("chaveArquivo" in await res.json(), false);
});
test("upload rejeita JSON/Base64 e conteúdo disfarçado de PDF", async () => {
  perfil = "ESTUDANTE";
  assert.equal((await request("POST", "/me/comprovantes", { conteudo: "YQ==" })).status, 415);
  assert.equal((await request("POST", "/me/comprovantes", upload(Buffer.from("<html>falso</html>")))).status, 415);
  assert.equal(salvos, 0);
});
test("falha no banco remove o arquivo já salvo", async () => {
  perfil = "ESTUDANTE"; erroPersistencia = true;
  assert.equal((await request("POST", "/me/comprovantes", upload())).status, 500);
  assert.equal(salvos, 1); assert.equal(removidos, 1);
});
test("upload rejeita mais de 10 MB antes de persistir", async () => {
  perfil = "ESTUDANTE";
  assert.equal((await request("POST", "/me/comprovantes", upload(Buffer.alloc(10 * 1024 * 1024 + 1)))).status, 413);
  assert.equal(salvos, 0);
});
