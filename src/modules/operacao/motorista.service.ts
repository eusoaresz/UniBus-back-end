import type { z } from "zod";
import { listarTrechosSchema } from "./operacao.schemas";
import { autorizarMotoristaTx } from "./execucao.service";
import { exigir, transacao, trechoTx, type Ator } from "./operacao.shared";

export function meusAtendimentos(usuarioId: string, filtros: z.infer<typeof listarTrechosSchema>) {
  return transacao(async (tx) => {
    const motorista = await tx.motorista.findUnique({ where: { usuarioId }, select: { id: true } });
    if (!motorista) return [];
    const { pagina, limite, data, turno, rotaId, sentido } = filtros;
    const inicio = data ? new Date(`${data}T00:00:00-03:00`) : undefined;
    const veiculoSelect = { id: true, identificacao: true, placa: true, tipo: true, capacidade: true } as const;
    const trechos = await tx.trechoViagem.findMany({ where: {
      status: { not: "RASCUNHO" },
      OR: [{ motoristaId: motorista.id }, { motoristaExtraId: motorista.id }],
      ...(inicio ? { saidaPrevistaEm: { gte: inicio, lt: new Date(inicio.getTime() + 86400000) } } : {}),
      ...(sentido ? { sentido } : {}),
      ...(turno || rotaId ? { viagem: { ...(turno ? { turno } : {}), ...(rotaId ? { rotaId } : {}) } } : {}),
    }, skip: (pagina - 1) * limite, take: limite,
    orderBy: [{ saidaPrevistaEm: "asc" }, { id: "asc" }],
    select: { id: true, viagemId: true, sentido: true, status: true,
      saidaPrevistaEm: true, chegadaPrevistaEm: true, iniciadoEm: true, concluidoEm: true,
      motoristaId: true, viagem: { select: { rotaId: true, nomeRota: true, turno: true } },
      veiculo: { select: veiculoSelect }, veiculoExtra: { select: veiculoSelect },
    } });
    return trechos.map(({ motoristaId, veiculo, veiculoExtra, ...trecho }) => ({
      ...trecho,
      alocacao: motoristaId === motorista.id ? "VEICULO" : "EXTRA",
      veiculo: motoristaId === motorista.id ? veiculo : veiculoExtra,
    }));
  });
}

export function resumoAtendimento(id: string, ator: Ator) {
  return transacao(async (tx) => {
    const trecho = await trechoTx(tx, id);
    await autorizarMotoristaTx(tx, trecho, ator);
    exigir(trecho.status !== "RASCUNHO", "Trecho não encontrado", 404);
    const motorista = ator.perfil === "MOTORISTA"
      ? await tx.motorista.findUniqueOrThrow({ where: { usuarioId: ator.id }, select: { id: true } }) : null;
    const alocacao = motorista ? (motorista.id === trecho.motoristaId ? "VEICULO" : "EXTRA") : null;
    const paradas = await tx.paradaTrecho.findMany({ where: { trechoId: id, ativa: true },
      orderBy: { ordem: "asc" }, select: { id: true, ordem: true, nome: true, cidade: true, endereco: true, referencia: true },
    });
    // Não paginar os totais; passageiros e dados pessoais ficam na rota própria.
    const participacoes = await tx.participacaoTrecho.findMany({ where: {
      trechoId: id, status: "CONFIRMADA", ...(alocacao ? { alocacao } : {}),
    }, select: { origemId: true, destinoId: true,
      embarques: { where: { status: "REGISTRADO" }, select: { id: true }, take: 1 },
    } });
    const contagens = new Map(paradas.map(parada => [parada.id, {
      embarquesPrevistos: 0, desembarquesPrevistos: 0, embarcadosNaOrigem: 0,
    }]));
    let embarcados = 0;
    for (const participacao of participacoes) {
      const origem = contagens.get(participacao.origemId);
      const destino = contagens.get(participacao.destinoId);
      if (origem) origem.embarquesPrevistos++;
      if (destino) destino.desembarquesPrevistos++;
      if (participacao.embarques.length) {
        embarcados++;
        if (origem) origem.embarcadosNaOrigem++;
      }
    }
    const geradoEm = new Date();
    const confirmacoesEncerradas = trecho.status !== "ABERTO" || trecho.inscricoesSuspensas || geradoEm > trecho.limiteConfirmacaoEm;
    const emOperacao = ["ABERTO", "FECHADO", "EM_ANDAMENTO"].includes(trecho.status);
    return {
      trechoId: trecho.id, sentido: trecho.sentido, status: trecho.status,
      geradoEm, confirmacoesEncerradas,
      saidaPrevistaEm: trecho.saidaPrevistaEm, chegadaPrevistaEm: trecho.chegadaPrevistaEm,
      viagem: { id: trecho.viagemId, rotaId: trecho.viagem.rotaId, nomeRota: trecho.viagem.nomeRota, turno: trecho.viagem.turno },
      alocacao,
      totais: { confirmados: participacoes.length, embarcados, semEmbarque: participacoes.length - embarcados },
      paradas: paradas.map((parada, indice) => {
        const contagem = contagens.get(parada.id)!;
        const semMovimentacao = contagem.embarquesPrevistos === 0 && contagem.desembarquesPrevistos === 0;
        const extremidade = indice === 0 || indice === paradas.length - 1;
        return { ...parada, ...contagem,
          semEmbarqueNaOrigem: contagem.embarquesPrevistos - contagem.embarcadosNaOrigem,
          semMovimentacao, extremidade,
          podeDispensar: emOperacao && confirmacoesEncerradas && !extremidade && semMovimentacao,
        };
      }),
    };
  });
}
