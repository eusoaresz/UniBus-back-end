import type { z } from "zod";
import { consultarRota } from "../viagens/viagens.service";
import { alterarRotaSchema } from "./operacao.schemas";
import { transacao, exigir, cancelarTx, notificar } from "./operacao.shared";
import { promoverTx } from "./participacoes.service";

export function alterarRotaPublicada(id: string, operadorId: string, dados: z.infer<typeof alterarRotaSchema>) {
  return transacao(async (tx) => {
    const agora = new Date();
    const viagem = await tx.viagem.findUnique({ where: { id }, include: {
      trechos: { include: { paradas: { where: { ativa: true }, orderBy: { ordem: "asc" } },
        participacoes: { where: { status: { in: ["CONFIRMADA", "EM_ESPERA"] } }, include: {
          origem: true, destino: true, estudante: { select: { usuarioId: true } },
        } } } },
    } });
    exigir(viagem, "Viagem não encontrada", 404);
    exigir(viagem.status === "PROGRAMADA" && viagem.trechos.length === 2 &&
      new Set(viagem.trechos.map((t) => t.sentido)).size === 2 &&
      viagem.trechos.every((t) => ["ABERTO", "FECHADO"].includes(t.status) && !t.iniciadoEm && agora < t.saidaPrevistaEm),
    "Troca de rota exige ida e volta publicadas e ainda não iniciadas");
    exigir(dados.rotaId !== viagem.rotaId, "Informe uma rota diferente da atual");
    const rota = await consultarRota(tx, dados.rotaId);
    const participacoes = viagem.trechos.flatMap((t) => t.participacoes);
    exigir(dados.resolucoes.every((r) => participacoes.some((p) => p.id === r.participacaoId)),
      "Resolução deve pertencer a uma participação ativa desta viagem", 400);

    for (const trecho of viagem.trechos) {
      const pontos = trecho.sentido === "IDA" ? rota.pontos : [...rota.pontos].reverse();
      const planos = trecho.participacoes.map((p) => {
        const resolucao = dados.resolucoes.find((r) => r.participacaoId === p.id);
        if (resolucao?.acao === "CANCELAR") return { p, cancelamento: resolucao.motivo, origem: 0, destino: 0 };
        const origemId = resolucao?.origemPontoId ?? p.origem.pontoParadaId;
        const destinoId = resolucao?.destinoPontoId ?? p.destino.pontoParadaId;
        const origem = pontos.findIndex((ponto) => ponto.id === origemId);
        const destino = pontos.findIndex((ponto) => ponto.id === destinoId);
        exigir(origem >= 0 && destino > origem,
          `Resolva embarque/desembarque ou cancele com motivo a participação ${p.id}`);
        return { p, cancelamento: null, origem, destino };
      });
      const maior = await tx.paradaTrecho.aggregate({ where: { trechoId: trecho.id }, _max: { versao: true } });
      const versao = (maior._max.versao ?? 0) + 1;
      await tx.paradaTrecho.updateMany({ where: { trechoId: trecho.id, ativa: true }, data: { ativa: false } });
      const novas = [];
      for (const [indice, ponto] of pontos.entries()) {
        novas.push(await tx.paradaTrecho.create({ data: { trechoId: trecho.id, versao,
          pontoParadaId: ponto.id, ordem: indice + 1, nome: ponto.nome,
          cidade: ponto.cidade, endereco: ponto.endereco, referencia: ponto.referencia } }));
      }
      for (const plano of planos) {
        const { p } = plano;
        if (plano.cancelamento) {
          await cancelarTx(tx, p.id, operadorId, plano.cancelamento);
          continue;
        }
        const origemId = novas[plano.origem].id, destinoId = novas[plano.destino].id;
        await tx.participacaoTrecho.update({ where: { id: p.id }, data: { origemId, destinoId } });
        await tx.alteracaoParticipacao.create({ data: { participacaoId: p.id, acao: "ALTERACAO_PONTOS",
          realizadaPorId: operadorId, motivo: dados.motivo,
          dadosAnteriores: { origemId: p.origemId, destinoId: p.destinoId }, dadosNovos: { origemId, destinoId } } });
        await notificar(tx, p.estudante.usuarioId, `rota:${trecho.id}:${versao}:${p.id}`,
          "Rota alterada", `Confira as paradas da rota ${rota.nome}. ${dados.motivo}`);
      }
      await tx.alteracaoTrecho.create({ data: { trechoId: trecho.id, realizadaPorId: operadorId, motivo: dados.motivo,
        dadosAnteriores: { rotaId: viagem.rotaId, nomeRota: viagem.nomeRota, paradas: trecho.paradas.map((p) => p.id) },
        dadosNovos: { rotaId: dados.rotaId, nomeRota: rota.nome, versao, paradas: novas.map((p) => p.id) } } });
    }
    const atualizada = await tx.viagem.update({ where: { id }, data: { rotaId: dados.rotaId, nomeRota: rota.nome } });
    for (const trecho of viagem.trechos) await promoverTx(tx, trecho.id, agora);
    return { id: atualizada.id, rotaId: atualizada.rotaId, nomeRota: atualizada.nomeRota, status: atualizada.status };
  });
}
