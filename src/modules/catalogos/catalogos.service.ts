import type { Prisma } from "../../../generated/prisma";
import { prisma } from "../../../lib/prisma";
import { HttpError } from "../../shared/errors/http-error";
import { executarTransacao } from "../carteira/carteira.financeiro";
import * as s from "./catalogos.schemas";

export type Catalogo = "rotas" | "cidades";
type Tx = Prisma.TransactionClient;
const paradas = { orderBy: { ordem: "asc" as const }, include: { pontoParada: true } };
const alvo = (tipo: Catalogo, id: string) => tipo === "rotas" ? { rotaId: id } : { cidadeId: id };
const json = (dados: object): Prisma.InputJsonObject => JSON.parse(JSON.stringify(dados));
const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
function transacao<T>(operadorId: string, fn: (tx: Tx) => Promise<T>) {
  return executarTransacao(prisma, async tx => {
    const op = await tx.usuario.findUnique({ where: { id: operadorId }, select: { perfil: true, status: true, bloqueioDisciplinarAte: true } });
    if (!op || op.perfil !== "OPERADOR" || op.status !== "ATIVA" || (op.bloqueioDisciplinarAte && op.bloqueioDisciplinarAte > new Date())) throw new HttpError(403, "Somente operador ativo pode alterar catálogos");
    return fn(tx);
  });
}
async function obter(tx: Pick<Tx, "rota" | "cidade">, tipo: Catalogo, id: string) {
  const registro = tipo === "rotas" ? await tx.rota.findUnique({ where: { id }, include: { paradas } }) : await tx.cidade.findUnique({ where: { id } });
  if (!registro) throw new HttpError(404, "Cadastro não encontrado");
  return registro;
}
async function validarPontos(tx: Tx, ids: string[]) {
  const pontos = await tx.pontoParada.findMany({ where: { id: { in: ids }, ativo: true } });
  if (ids.length < 3 || pontos.length !== ids.length) throw new HttpError(409, "Informe ao menos três pontos distintos e ativos");
  const primeiros = ids.slice(0, 2).map(id => pontos.find(p => p.id === id)!);
  if (normalizar(primeiros[0].nome) !== "prefeitura" || normalizar(primeiros[1].nome) !== "praca" || primeiros.some(p => normalizar(p.cidade) !== "pedro osorio")) {
    throw new HttpError(409, "A rota deve iniciar em Prefeitura e Praça, em Pedro Osório, nesta ordem");
  }
}
async function auditar(tx: Tx, tipo: Catalogo, id: string, operadorId: string, motivo: string, anterior: object, novo: object) {
  await tx.alteracaoCatalogo.create({ data: { ...alvo(tipo, id), realizadaPorId: operadorId, motivo, dadosAnteriores: json(anterior), dadosNovos: json(novo) } });
}
export function criar(tipo: Catalogo, corpo: unknown, operadorId: string) {
  return transacao(operadorId, async tx => {
    let novo;
    if (tipo === "cidades") novo = await tx.cidade.create({ data: s.cidadeSchema.parse(corpo) });
    else {
      const { pontoIds, ...dados } = s.rotaSchema.parse(corpo);
      await validarPontos(tx, pontoIds);
      novo = await tx.rota.create({ data: { ...dados, paradas: { create: pontoIds.map((pontoParadaId, i) => ({ pontoParadaId, ordem: i + 1 })) } }, include: { paradas } });
    }
    await auditar(tx, tipo, novo.id, operadorId, "Cadastro administrativo", {}, novo);
    return novo;
  });
}
export function consultar(tipo: Catalogo, id: string) { return obter(prisma, tipo, id); }
export async function listar(tipo: Catalogo, query: unknown) {
  const { pagina, limite, nome, ativo } = s.listarCatalogosSchema.parse(query);
  const opcoes = { where: { ativa: ativo, nome: nome ? { contains: nome, mode: "insensitive" as const } : undefined },
    skip: (pagina - 1) * limite, take: limite + 1, orderBy: [{ nome: "asc" as const }, { id: "asc" as const }] };
  const registros = tipo === "rotas" ? await prisma.rota.findMany(opcoes) : await prisma.cidade.findMany(opcoes);
  return { dados: registros.slice(0, limite), meta: { pagina, limite, temProxima: registros.length > limite } };
}
export function editar(tipo: Catalogo, id: string, corpo: unknown, operadorId: string) {
  return transacao(operadorId, async tx => {
    const anterior = await obter(tx, tipo, id);
    let novo, motivo: string;
    if (tipo === "cidades") {
      const dados = s.editarCidadeSchema.parse(corpo); motivo = dados.motivo;
      novo = await tx.cidade.update({ where: { id }, data: { nome: dados.nome } });
    } else {
      const { pontoIds, motivo: justificativa, ...dados } = s.editarRotaSchema.parse(corpo); motivo = justificativa;
      const atual = await tx.rota.findUniqueOrThrow({ where: { id }, include: { paradas } });
      const mudouPontos = pontoIds !== undefined && JSON.stringify(pontoIds) !== JSON.stringify(atual.paradas.map(p => p.pontoParadaId));
      if (pontoIds) await validarPontos(tx, pontoIds);
      if (mudouPontos) {
        await tx.rotaParada.deleteMany({ where: { rotaId: id } });
        await tx.rotaParada.createMany({ data: pontoIds!.map((pontoParadaId, i) => ({ rotaId: id, pontoParadaId, ordem: i + 1 })) });
      }
      novo = await tx.rota.update({ where: { id }, data: dados, include: { paradas } });
      if (mudouPontos || (dados.nome !== undefined && dados.nome !== anterior.nome)) {
        await tx.viagem.updateMany({ where: { rotaId: id, status: "RASCUNHO" }, data: { revisaoRotaPendente: true } });
      }
    }
    await auditar(tx, tipo, id, operadorId, motivo, anterior, novo);
    return novo;
  });
}
export function alterarStatus(tipo: Catalogo, id: string, corpo: unknown, operadorId: string) {
  const { ativo, motivo } = s.statusCatalogoSchema.parse(corpo);
  return transacao(operadorId, async tx => {
    const anterior = await obter(tx, tipo, id);
    if (tipo === "rotas" && ativo) {
      const rota = await tx.rota.findUniqueOrThrow({ where: { id }, include: { paradas } });
      await validarPontos(tx, rota.paradas.map(p => p.pontoParadaId));
    }
    const novo = tipo === "rotas" ? await tx.rota.update({ where: { id }, data: { ativa: ativo }, include: { paradas } })
      : await tx.cidade.update({ where: { id }, data: { ativa: ativo } });
    await auditar(tx, tipo, id, operadorId, motivo, anterior, novo);
    return novo;
  });
}
export async function historico(tipo: Catalogo, id: string, query: unknown) {
  await obter(prisma, tipo, id);
  const { pagina, limite } = s.paginacaoCatalogosSchema.parse(query);
  const registros = await prisma.alteracaoCatalogo.findMany({ where: alvo(tipo, id), skip: (pagina - 1) * limite, take: limite + 1,
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }], select: { id: true, motivo: true, dadosAnteriores: true, dadosNovos: true, criadoEm: true,
      realizadaPor: { select: { id: true, nome: true } } } });
  return { dados: registros.slice(0, limite), meta: { pagina, limite, temProxima: registros.length > limite } };
}
