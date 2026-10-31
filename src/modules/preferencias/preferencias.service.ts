import { Prisma } from "../../../generated/prisma";
import { prisma } from "../../../lib/prisma";
import { HttpError } from "../../shared/errors/http-error";
import { preferenciasDto, preferenciasOpcoesDto, preferenciasSelect } from "./preferencias.dto";
import type { z } from "zod";
import { atualizarPreferenciasSchema } from "./preferencias.schemas";

type DadosAtualizacao = z.infer<typeof atualizarPreferenciasSchema>;

export async function consultar(usuarioId: string) {
  const preferencias = await prisma.preferencias.findUnique({
    where: { usuarioId },
    select: preferenciasSelect,
  });
  return preferenciasDto(preferencias);
}

export async function opcoes() {
  const [rotas, cidades] = await Promise.all([
    prisma.rota.findMany({
      where: { ativa: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    prisma.cidade.findMany({
      where: { ativa: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
  ]);
  return preferenciasOpcoesDto(rotas, cidades);
}

export async function atualizar(usuarioId: string, dados: DadosAtualizacao) {
  const maxTentativas = 3;
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      return await prisma.$transaction(async (tx) => {
      const rotaIds = dados.rotaIds;
      const cidadeIds = dados.cidadeIds;

      if (rotaIds) {
        const rotas = await tx.rota.findMany({
          where: { id: { in: rotaIds }, ativa: true },
          select: { id: true },
        });
        if (rotas.length !== new Set(rotaIds).size) {
          throw new HttpError(400, "Uma ou mais rotas são inválidas ou inativas");
        }
      }
      if (cidadeIds) {
        const cidades = await tx.cidade.findMany({
          where: { id: { in: cidadeIds }, ativa: true },
          select: { id: true },
        });
        if (cidades.length !== new Set(cidadeIds).size) {
          throw new HttpError(400, "Uma ou mais cidades são inválidas ou inativas");
        }
      }

      const preferencias = await tx.preferencias.upsert({
        where: { usuarioId },
        create: {
          usuarioId,
          turnos: dados.turnos ?? [],
          rotas: { create: (rotaIds ?? []).map((rotaId) => ({ rota: { connect: { id: rotaId } } })) },
          cidades: { create: (cidadeIds ?? []).map((cidadeId) => ({ cidade: { connect: { id: cidadeId } } })) },
        },
        update: {
          ...(dados.turnos ? { turnos: dados.turnos } : {}),
          ...(rotaIds ? { rotas: { deleteMany: {}, create: rotaIds.map((rotaId) => ({ rota: { connect: { id: rotaId } } })) } } : {}),
          ...(cidadeIds ? { cidades: { deleteMany: {}, create: cidadeIds.map((cidadeId) => ({ cidade: { connect: { id: cidadeId } } })) } } : {}),
        },
        select: preferenciasSelect,
      });
      return preferenciasDto(preferencias);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (erro) {
      const codigo = erro && typeof erro === "object" && "code" in erro ? erro.code : undefined;
      if (codigo !== "P2034") throw erro;
      if (tentativa === maxTentativas) {
      throw new HttpError(409, "As preferências foram alteradas simultaneamente. Tente novamente");
      }
    }
  }
  throw new HttpError(409, "As preferências foram alteradas simultaneamente. Tente novamente");
}