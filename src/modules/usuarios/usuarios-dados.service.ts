import type { z } from "zod";
import { Prisma } from "../../../generated/prisma";
import { prisma } from "../../../lib/prisma";
import { HttpError } from "../../shared/errors/http-error";
import { atualizarDadosSchema } from "./usuarios.schemas";
import { usuarioDto, usuarioSelect } from "./usuarios.dto";

export async function transacaoPerfil<T>(operadorId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const op = await tx.usuario.findUnique({ where: { id: operadorId }, select: { perfil: true, status: true, bloqueioDisciplinarAte: true } });
        if (!op || op.perfil !== "OPERADOR" || op.status !== "ATIVA" || (op.bloqueioDisciplinarAte && op.bloqueioDisciplinarAte > new Date())) {
          throw new HttpError(403, "Somente operador ativo pode alterar dados pessoais");
        }
        return fn(tx);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (erro) {
      const codigo = erro && typeof erro === "object" && "code" in erro ? erro.code : undefined;
      if (codigo === "P2002") throw new HttpError(409, "Dados já cadastrados");
      if (codigo === "P2025") throw new HttpError(404, "Usuário ou cadastro acadêmico não encontrado");
      if (codigo !== "P2034") throw erro;
      if (tentativa === 2) throw new HttpError(409, "Dados alterados simultaneamente. Consulte e tente novamente");
    }
  }
  throw new HttpError(409, "Não foi possível concluir a alteração");
}

export async function atualizarDadosUsuario(id: string, operadorId: string, dados: z.infer<typeof atualizarDadosSchema>) {
  return transacaoPerfil(operadorId, async (tx) => {
    const anterior = await tx.usuario.findUnique({ where: { id }, select: usuarioSelect });
    if (!anterior) throw new HttpError(404, "Usuário não encontrado");
    if (dados.estudante) {
      if (!anterior.estudante || anterior.perfil !== "ESTUDANTE") throw new HttpError(409, "Usuário sem cadastro acadêmico de estudante");
      if (dados.estudante.cidadeOrigemId) {
        const cidade = await tx.cidade.findUnique({ where: { id: dados.estudante.cidadeOrigemId }, select: { ativa: true } });
        if (!cidade || !cidade.ativa) throw new HttpError(400, "Cidade de origem inexistente ou inativa");
      }
      if (dados.estudante.unidadeEnsinoId) {
        const unidade = await tx.unidadeEnsino.findUnique({ where: { id: dados.estudante.unidadeEnsinoId },
          select: { ativa: true, instituicaoEnsino: { select: { ativa: true } }, pontoParada: { select: { ativo: true } } } });
        if (!unidade || !unidade.ativa || !unidade.instituicaoEnsino.ativa || !unidade.pontoParada.ativo) throw new HttpError(400, "Unidade de ensino indisponível");
      }
      await tx.estudante.update({ where: { id: anterior.estudante.id }, data: dados.estudante });
    }
    const emailAlterado = dados.email !== undefined && dados.email !== anterior.email;
    const atualizado = await tx.usuario.update({ where: { id }, data: {
      nome: dados.nome, telefone: dados.telefone, email: dados.email,
      dataNascimento: dados.dataNascimento === undefined ? undefined : dados.dataNascimento === null ? null : new Date(`${dados.dataNascimento}T00:00:00Z`),
      emailVerificadoEm: emailAlterado ? null : undefined,
    }, select: usuarioSelect });
    if (emailAlterado) await tx.tokenAcesso.updateMany({ where: { usuarioId: id, utilizadoEm: null }, data: { utilizadoEm: new Date() } });
    await tx.alteracaoPerfil.create({ data: { usuarioId: id, realizadaPorId: operadorId, motivo: dados.motivo,
      dadosAnteriores: JSON.parse(JSON.stringify(usuarioDto(anterior))), dadosNovos: JSON.parse(JSON.stringify(usuarioDto(atualizado))) } });
    return usuarioDto(atualizado);
  });
}
