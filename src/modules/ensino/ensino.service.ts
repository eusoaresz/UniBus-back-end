import type { Prisma } from "../../../generated/prisma";
import { prisma } from "../../../lib/prisma";
import { HttpError } from "../../shared/errors/http-error";
import { executarTransacao } from "../carteira/carteira.financeiro";
import * as s from "./ensino.schemas";

export type CadastroEnsino = "instituicoes" | "unidades" | "pontos";
type Tx = Prisma.TransactionClient;
const alvo = (tipo: CadastroEnsino, id: string) => tipo === "instituicoes" ? { instituicaoEnsinoId: id }
  : tipo === "unidades" ? { unidadeEnsinoId: id } : { pontoParadaId: id };
const json = (dados: object): Prisma.InputJsonObject => JSON.parse(JSON.stringify(dados));
function transacao<T>(operadorId: string, fn: (tx: Tx) => Promise<T>) {
  return executarTransacao(prisma, async tx => {
    const op = await tx.usuario.findUnique({ where: { id: operadorId }, select: { perfil: true, status: true, bloqueioDisciplinarAte: true } });
    if (!op || op.perfil !== "OPERADOR" || op.status !== "ATIVA" || (op.bloqueioDisciplinarAte && op.bloqueioDisciplinarAte > new Date())) {
      throw new HttpError(403, "Somente operador ativo pode alterar estes cadastros");
    }
    return fn(tx);
  });
}
async function obter(tx: Pick<Tx, "instituicaoEnsino" | "unidadeEnsino" | "pontoParada">, tipo: CadastroEnsino, id: string) {
  const registro = tipo === "instituicoes" ? await tx.instituicaoEnsino.findUnique({ where: { id } })
    : tipo === "unidades" ? await tx.unidadeEnsino.findUnique({ where: { id } }) : await tx.pontoParada.findUnique({ where: { id } });
  if (!registro) throw new HttpError(404, "Cadastro não encontrado");
  return registro;
}
async function auditar(tx: Tx, tipo: CadastroEnsino, id: string, operadorId: string, motivo: string, anterior: object, novo: object) {
  await tx.alteracaoEnsino.create({ data: { ...alvo(tipo, id), realizadaPorId: operadorId, motivo,
    dadosAnteriores: json(anterior), dadosNovos: json(novo) } });
}
async function validarVinculosUnidade(tx: Tx, instituicaoEnsinoId: string, pontoParadaId: string) {
  const instituicao = await tx.instituicaoEnsino.findUnique({ where: { id: instituicaoEnsinoId } });
  const ponto = await tx.pontoParada.findUnique({ where: { id: pontoParadaId } });
  if (!instituicao?.ativa || !ponto?.ativo) throw new HttpError(409, "Instituição e ponto devem existir e estar ativos");
}
export function criar(tipo: CadastroEnsino, corpo: unknown, operadorId: string) {
  return transacao(operadorId, async tx => {
    let registro;
    if (tipo === "instituicoes") registro = await tx.instituicaoEnsino.create({ data: s.instituicaoSchema.parse(corpo) });
    else if (tipo === "pontos") registro = await tx.pontoParada.create({ data: s.pontoSchema.parse(corpo) });
    else {
      const dados = s.unidadeSchema.parse(corpo);
      await validarVinculosUnidade(tx, dados.instituicaoEnsinoId, dados.pontoParadaId);
      registro = await tx.unidadeEnsino.create({ data: dados });
    }
    await auditar(tx, tipo, registro.id, operadorId, "Cadastro administrativo", {}, registro);
    return registro;
  });
}
export function consultar(tipo: CadastroEnsino, id: string) { return obter(prisma, tipo, id); }
export async function listar(tipo: CadastroEnsino, query: unknown) {
  const { pagina, limite, nome, ativo } = s.listarEnsinoSchema.parse(query);
  const opcoes = { skip: (pagina - 1) * limite, take: limite + 1,
    orderBy: [{ criadoEm: "desc" as const }, { id: "desc" as const }] };
  const busca = nome ? { contains: nome, mode: "insensitive" as const } : undefined;
  const registros = tipo === "instituicoes" ? await prisma.instituicaoEnsino.findMany({ ...opcoes, where: { nome: busca, ativa: ativo } })
    : tipo === "unidades" ? await prisma.unidadeEnsino.findMany({ ...opcoes, where: { nome: busca, ativa: ativo } })
    : await prisma.pontoParada.findMany({ ...opcoes, where: { nome: busca, ativo } });
  return { dados: registros.slice(0, limite), meta: { pagina, limite, temProxima: registros.length > limite } };
}
export function editar(tipo: CadastroEnsino, id: string, corpo: unknown, operadorId: string) {
  return transacao(operadorId, async tx => {
    const anterior = await obter(tx, tipo, id);
    let novo, motivo: string;
    if (tipo === "instituicoes") {
      const dados = s.editarInstituicaoSchema.parse(corpo); motivo = dados.motivo;
      const { motivo: _, ...campos } = dados;
      novo = await tx.instituicaoEnsino.update({ where: { id }, data: campos });
    } else if (tipo === "pontos") {
      const dados = s.editarPontoSchema.parse(corpo); motivo = dados.motivo;
      const { motivo: _, ...campos } = dados;
      novo = await tx.pontoParada.update({ where: { id }, data: campos });
      if (Object.entries(campos).some(([campo, valor]) => valor !== (anterior as unknown as Record<string, unknown>)[campo])) {
        await tx.viagem.updateMany({ where: { status: "RASCUNHO", trechos: { some: { paradas: { some: { pontoParadaId: id, ativa: true } } } } }, data: { revisaoRotaPendente: true } });
      }
    } else {
      const dados = s.editarUnidadeSchema.parse(corpo); motivo = dados.motivo;
      const atual = await tx.unidadeEnsino.findUniqueOrThrow({ where: { id } });
      if (dados.pontoParadaId) await validarVinculosUnidade(tx, atual.instituicaoEnsinoId, dados.pontoParadaId);
      const { motivo: _, ...campos } = dados;
      novo = await tx.unidadeEnsino.update({ where: { id }, data: campos });
    }
    await auditar(tx, tipo, id, operadorId, motivo, anterior, novo);
    return novo;
  });
}
export function alterarStatus(tipo: CadastroEnsino, id: string, corpo: unknown, operadorId: string) {
  const dados = s.statusEnsinoSchema.parse(corpo);
  return transacao(operadorId, async tx => {
    const anterior = await obter(tx, tipo, id);
    if (!dados.ativo) {
      if (tipo !== "pontos") {
        const vinculo = await tx.estudante.findFirst({ where: { statusCadastro: { in: ["APROVADO", "SUSPENSO"] },
          ...(tipo === "unidades" ? { unidadeEnsinoId: id } : { unidadeEnsino: { instituicaoEnsinoId: id } }) }, select: { id: true } });
        if (vinculo) throw new HttpError(409, "Resolva os vínculos dos estudantes aprovados ou suspensos antes de desativar");
      } else {
        const unidade = await tx.unidadeEnsino.findFirst({ where: { pontoParadaId: id, ativa: true }, select: { id: true } });
        const rota = await tx.rotaParada.findFirst({ where: { pontoParadaId: id, rota: { ativa: true } }, select: { id: true } });
        const trecho = await tx.paradaTrecho.findFirst({ where: { pontoParadaId: id, ativa: true,
          trecho: { status: { in: ["ABERTO", "FECHADO", "EM_ANDAMENTO"] } } }, select: { id: true } });
        if (unidade || rota || trecho) throw new HttpError(409, "Resolva as unidades, rotas ativas e trechos em operação antes de desativar o ponto");
      }
    } else if (tipo === "unidades") {
      const unidade = await tx.unidadeEnsino.findUniqueOrThrow({ where: { id } });
      await validarVinculosUnidade(tx, unidade.instituicaoEnsinoId, unidade.pontoParadaId);
    }
    const novo = tipo === "instituicoes" ? await tx.instituicaoEnsino.update({ where: { id }, data: { ativa: dados.ativo } })
      : tipo === "unidades" ? await tx.unidadeEnsino.update({ where: { id }, data: { ativa: dados.ativo } })
      : await tx.pontoParada.update({ where: { id }, data: { ativo: dados.ativo } });
    await auditar(tx, tipo, id, operadorId, dados.motivo, anterior, novo);
    return novo;
  });
}
export async function historico(tipo: CadastroEnsino, id: string, query: unknown) {
  await obter(prisma, tipo, id);
  const { pagina, limite } = s.paginacaoEnsinoSchema.parse(query);
  const registros = await prisma.alteracaoEnsino.findMany({ where: alvo(tipo, id), skip: (pagina - 1) * limite, take: limite + 1,
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }], select: { id: true, motivo: true, dadosAnteriores: true, dadosNovos: true, criadoEm: true,
      realizadaPor: { select: { id: true, nome: true } } } });
  return { dados: registros.slice(0, limite), meta: { pagina, limite, temProxima: registros.length > limite } };
}
