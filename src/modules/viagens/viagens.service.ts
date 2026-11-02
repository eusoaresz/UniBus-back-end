import type { z } from "zod";
import { Prisma } from "../../../generated/prisma";
import { prisma } from "../../../lib/prisma";
import { HttpError } from "../../shared/errors/http-error";
import { criarViagemRascunhoSchema, editarViagemRascunhoSchema, listarViagensSchema } from "./viagens.schemas";
import { viagemDto, viagemSelect } from "./viagens.dto";

type DadosRascunho = z.infer<typeof criarViagemRascunhoSchema>;

async function transacao<T>(operacao: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      return await prisma.$transaction(operacao, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (erro) {
      const codigo = erro && typeof erro === "object" && "code" in erro ? erro.code : undefined;
      if (codigo === "P2002") throw new HttpError(409, "Já existe viagem para esta data, turno e rota");
      if (codigo === "P2034") {
        if (tentativa < 2) continue;
        throw new HttpError(409, "A viagem foi alterada simultaneamente. Tente novamente");
      }
      throw erro;
    }
  }
  throw new HttpError(409, "Não foi possível concluir a alteração");
}

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export async function consultarRota(tx: Prisma.TransactionClient, id: string) {
  const rota = await tx.rota.findUnique({
    where: { id },
    select: { nome: true, ativa: true, paradas: {
      orderBy: { ordem: "asc" }, select: { pontoParada: {
        select: { id: true, nome: true, cidade: true, endereco: true, referencia: true, ativo: true },
      } },
    } },
  });
  if (!rota) throw new HttpError(404, "Rota não encontrada");
  if (!rota.ativa) throw new HttpError(409, "A rota está inativa");
  const pontos = rota.paradas.map((parada) => parada.pontoParada);
  if (pontos.length < 3 || pontos.some((ponto) => !ponto.ativo)) {
    throw new HttpError(409, "A rota precisa de Prefeitura, Praça e pelo menos uma parada de destino, todas ativas");
  }
  if (normalizar(pontos[0].nome) !== "prefeitura" || normalizar(pontos[1].nome) !== "praca" ||
      pontos.slice(0, 2).some((ponto) => normalizar(ponto.cidade) !== "pedro osorio")) {
    throw new HttpError(409, "A rota deve começar em Prefeitura e Praça, em Pedro Osório, nesta ordem");
  }
  return { nome: rota.nome, pontos };
}

function dadosTrechos(dados: DadosRascunho, pontos: Awaited<ReturnType<typeof consultarRota>>["pontos"]) {
  return dados.trechos.map((trecho) => {
    const saida = new Date(trecho.saidaPrevistaEm);
    const limite = new Date(saida.getTime() - 60 * 60 * 1000);
    const ordenados = trecho.sentido === "IDA" ? pontos : [...pontos].reverse();
    return {
      sentido: trecho.sentido,
      saidaPrevistaEm: saida,
      chegadaPrevistaEm: new Date(trecho.chegadaPrevistaEm),
      limiteConfirmacaoEm: limite,
      limiteCancelamentoEm: limite,
      paradas: { create: ordenados.map((ponto, indice) => ({
        pontoParadaId: ponto.id, ordem: indice + 1, nome: ponto.nome,
        cidade: ponto.cidade, endereco: ponto.endereco, referencia: ponto.referencia,
      })) },
    };
  });
}

export function criarRascunho(dados: DadosRascunho, operadorId: string) {
  return transacao(async (tx) => {
    const rota = await consultarRota(tx, dados.rotaId);
    const viagem = await tx.viagem.create({
      data: {
        data: new Date(dados.data), turno: dados.turno, rotaId: dados.rotaId,
        nomeRota: rota.nome, criadaPorId: operadorId,
        trechos: { create: dadosTrechos(dados, rota.pontos) },
      },
      select: viagemSelect,
    });
    return viagemDto(viagem);
  });
}

export async function consultarViagem(id: string) {
  const viagem = await prisma.viagem.findUnique({ where: { id }, select: viagemSelect });
  if (!viagem) throw new HttpError(404, "Viagem não encontrada");
  return viagemDto(viagem);
}

export async function listarViagens({ pagina, limite, data, ...filtros }: z.infer<typeof listarViagensSchema>) {
  const viagens = await prisma.viagem.findMany({
    where: { ...filtros, data: data ? new Date(data) : undefined },
    skip: (pagina - 1) * limite, take: limite + 1,
    orderBy: [{ data: "desc" }, { id: "desc" }], select: viagemSelect,
  });
  return { dados: viagens.slice(0, limite).map(viagemDto), meta: { pagina, limite, temProxima: viagens.length > limite } };
}

export function editarRascunho(id: string, dados: z.infer<typeof editarViagemRascunhoSchema>, operadorId: string) {
  return transacao(async (tx) => {
    const atual = await tx.viagem.findUnique({ where: { id }, select: viagemSelect });
    if (!atual) throw new HttpError(404, "Viagem não encontrada");
    if (atual.status !== "RASCUNHO" || atual.trechos.some((t) => t.status !== "RASCUNHO")) {
      throw new HttpError(409, "Somente rascunhos podem ser editados por esta rota");
    }
    if (atual.trechos.length !== 2) throw new HttpError(409, "A viagem precisa ter os dois trechos cadastrados");
    const participacoes = await tx.participacaoTrecho.count({ where: { trecho: { viagemId: id } } });
    if (participacoes > 0) throw new HttpError(409, "Rascunho com participações exige análise antes de alteração");
    const rota = await consultarRota(tx, dados.rotaId);
    const trechos = dadosTrechos(dados, rota.pontos);
    for (const trecho of trechos) {
      const anterior = atual.trechos.find((t) => t.sentido === trecho.sentido)!;
      await tx.paradaTrecho.deleteMany({ where: { trechoId: anterior.id } });
      await tx.trechoViagem.update({
        where: { id: anterior.id }, data: {
          ...trecho,
          alteracoes: { create: {
            motivo: dados.motivo, realizadaPorId: operadorId,
            dadosAnteriores: JSON.parse(JSON.stringify({ data: atual.data, turno: atual.turno, rotaId: atual.rotaId, trecho: anterior })),
            dadosNovos: JSON.parse(JSON.stringify({ data: dados.data, turno: dados.turno, rotaId: dados.rotaId, trecho })),
          } },
        },
      });
    }
    return viagemDto(await tx.viagem.update({
      where: { id }, data: { data: new Date(dados.data), turno: dados.turno, rotaId: dados.rotaId, nomeRota: rota.nome, revisaoRotaPendente: false },
      select: viagemSelect,
    }));
  });
}
