import bcrypt from "bcrypt";
import type { z } from "zod";
import { fileTypeFromBuffer } from "file-type";
import { Prisma } from "../../../generated/prisma";
import { prisma } from "../../../lib/prisma";
import { HttpError } from "../../shared/errors/http-error";
import { comprovantesStorage } from "../../shared/storage/comprovantes.storage";
import {
  arquivoComprovanteSchema,
  criarEstudanteSchema,
  editarEstudanteSchema,
  listarEstudantesSchema,
  listarComprovantesSchema,
  TAMANHO_MAXIMO_COMPROVANTE,
} from "./estudantes.schemas";
import {
  comprovanteDto,
  comprovanteSelect,
  estudanteDetalheDto,
  estudanteDetalheSelect,
  estudanteListaDto,
  estudanteListaSelect,
  estudanteMeDto,
  estudanteMeSelect,
} from "./estudantes.dto";

type DadosCriacao = z.infer<typeof criarEstudanteSchema>;
type DadosEdicao = z.infer<typeof editarEstudanteSchema>;
type FiltrosLista = z.infer<typeof listarEstudantesSchema>;
type ArquivoRecebido = { nomeOriginal: string; conteudo: Buffer };

async function comTransacao<T>(operacao: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(operacao, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (erro) {
    const codigo = erro && typeof erro === "object" && "code" in erro ? erro.code : undefined;
    if (codigo === "P2002") throw new HttpError(409, "Já existe cadastro acadêmico para este estudante ou matrícula");
    if (codigo === "P2034") throw new HttpError(409, "O cadastro foi alterado simultaneamente. Tente novamente");
    if (codigo === "P2025") throw new HttpError(404, "Cadastro acadêmico não encontrado");
    throw erro;
  }
}

async function validarUnidade(tx: Prisma.TransactionClient, unidadeEnsinoId: string) {
  const unidade = await tx.unidadeEnsino.findUnique({
    where: { id: unidadeEnsinoId },
    select: { ativa: true, instituicaoEnsino: { select: { ativa: true } }, pontoParada: { select: { ativo: true } } },
  });
  if (!unidade) throw new HttpError(404, "Unidade de ensino não encontrada");
  if (!unidade.ativa || !unidade.instituicaoEnsino.ativa || !unidade.pontoParada.ativo) {
    throw new HttpError(409, "Unidade de ensino indisponível");
  }
}

export async function criarEstudante(dados: DadosCriacao, operadorId: string) {
  const { senha, matricula, unidadeEnsinoId, previsaoConclusao, curso, cidadeOrigemId, dataNascimento, ...usuario } = dados;
  const senhaHash = await bcrypt.hash(senha, 10);
  return comTransacao(async (tx) => {
    await validarUnidade(tx, unidadeEnsinoId);
    if (cidadeOrigemId) {
      const cidade = await tx.cidade.findUnique({ where: { id: cidadeOrigemId }, select: { ativa: true } });
      if (!cidade?.ativa) throw new HttpError(400, "Cidade de origem inexistente ou inativa");
    }
    const estudante = await tx.estudante.create({
      data: {
        matricula,
        curso: curso ?? null,
        cidadeOrigem: cidadeOrigemId ? { connect: { id: cidadeOrigemId } } : undefined,
        previsaoConclusao: new Date(previsaoConclusao),
        unidadeEnsino: { connect: { id: unidadeEnsinoId } },
        statusCadastro: "APROVADO",
        analisadoEm: new Date(),
        analisadoPor: { connect: { id: operadorId } },
        usuario: { create: { ...usuario, dataNascimento: dataNascimento ? new Date(`${dataNascimento}T00:00:00Z`) : null,
          perfil: "ESTUDANTE", senhaHash, cadastradoPorId: operadorId } },
        carteira: { create: {} },
      },
      select: estudanteDetalheSelect,
    });
    return estudanteDetalheDto(estudante);
  });
}

export async function consultarMe(usuarioId: string) {
  const estudante = await prisma.estudante.findUnique({
    where: { usuarioId },
    select: estudanteMeSelect,
  });
  if (!estudante) throw new HttpError(404, "Cadastro acadêmico não encontrado");
  return estudanteMeDto(estudante);
}

export async function consultarEstudante(id: string) {
  const estudante = await prisma.estudante.findUnique({
    where: { id },
    select: estudanteDetalheSelect,
  });
  if (!estudante) throw new HttpError(404, "Cadastro acadêmico não encontrado");
  return estudanteDetalheDto(estudante);
}

export async function listarEstudantes({ pagina, limite, statusCadastro, unidadeEnsinoId }: FiltrosLista) {
  const registros = await prisma.estudante.findMany({
    where: { statusCadastro, unidadeEnsinoId },
    skip: (pagina - 1) * limite,
    take: limite + 1,
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
    select: estudanteListaSelect,
  });
  return {
    dados: registros.slice(0, limite).map(estudanteListaDto),
    meta: { pagina, limite, temProxima: registros.length > limite },
  };
}

export async function editarEstudante(id: string, dados: DadosEdicao) {
  return comTransacao(async (tx) => {
    const atual = await tx.estudante.findUnique({
      where: { id },
      select: { id: true, statusCadastro: true, matricula: true, unidadeEnsinoId: true },
    });
    if (!atual) throw new HttpError(404, "Cadastro acadêmico não encontrado");
    if (atual.statusCadastro === "APROVADO") {
      throw new HttpError(409, "Cadastro aprovado não pode ser editado por esta rota");
    }

    const matricula = dados.matricula ?? atual.matricula;
    const unidadeEnsinoId = dados.unidadeEnsinoId ?? atual.unidadeEnsinoId;
    const duplicada = await tx.estudante.findFirst({
      where: { matricula, unidadeEnsinoId, id: { not: id } }, select: { id: true },
    });
    if (duplicada) throw new HttpError(409, "A matrícula já está cadastrada nesta unidade");
    await validarUnidade(tx, unidadeEnsinoId);

    const estudante = await tx.estudante.update({
      where: { id },
      data: {
        matricula: dados.matricula,
        previsaoConclusao: dados.previsaoConclusao
          ? new Date(`${dados.previsaoConclusao}T00:00:00.000Z`)
          : undefined,
        unidadeEnsinoId: dados.unidadeEnsinoId,
      },
      select: estudanteDetalheSelect,
    });
    return estudanteDetalheDto(estudante);
  });
}

async function alterarStatus(
  id: string,
  operadorId: string,
  statusCadastro: "APROVADO" | "REJEITADO" | "SUSPENSO",
  observacao?: string,
  reativacao = false,
) {
  return comTransacao(async (tx) => {
    const estudante = await tx.estudante.findUnique({
      where: { id },
      select: { id: true, statusCadastro: true, usuarioId: true, unidadeEnsinoId: true,
        usuario: { select: { perfil: true } },
        unidadeEnsino: { select: { ativa: true, instituicaoEnsino: { select: { ativa: true } } } },
      },
    });
    if (!estudante) throw new HttpError(404, "Cadastro acadêmico não encontrado");

    const transicoes: Record<string, string[]> = {
      APROVADO: reativacao ? ["SUSPENSO"] : ["PENDENTE", "REJEITADO"],
      REJEITADO: ["PENDENTE"],
      SUSPENSO: ["APROVADO"],
    };
    if (!transicoes[statusCadastro].includes(estudante.statusCadastro)) {
      throw new HttpError(409, `Não é possível alterar o cadastro de ${estudante.statusCadastro} para ${statusCadastro}`);
    }

    if (statusCadastro === "APROVADO") {
      if (estudante.usuario.perfil !== "ESTUDANTE") throw new HttpError(409, "O usuário não possui perfil de estudante");
      await validarUnidade(tx, estudante.unidadeEnsinoId);
    }

    const alteracao = await tx.estudante.updateMany({
      where: { id, statusCadastro: estudante.statusCadastro },
      data: {
        statusCadastro,
        analisadoEm: new Date(),
        analisadoPorId: operadorId,
        observacaoAnalise: observacao ?? null,
      },
    });
    if (alteracao.count !== 1) throw new HttpError(409, "O cadastro foi alterado simultaneamente. Tente novamente");
    if (statusCadastro === "APROVADO") {
      await tx.carteira.upsert({ where: { estudanteId: id }, create: { estudanteId: id }, update: {} });
    }
    const atualizado = await tx.estudante.findUnique({ where: { id }, select: estudanteDetalheSelect });
    if (!atualizado) throw new HttpError(404, "Cadastro acadêmico não encontrado");
    return estudanteDetalheDto(atualizado);
  });
}

export function aprovarEstudante(id: string, operadorId: string, observacao?: string) {
  return alterarStatus(id, operadorId, "APROVADO", observacao);
}

export function rejeitarEstudante(id: string, operadorId: string, motivo: string) {
  return alterarStatus(id, operadorId, "REJEITADO", motivo);
}

export function suspenderEstudante(id: string, operadorId: string, motivo: string) {
  return alterarStatus(id, operadorId, "SUSPENSO", motivo);
}

export function reativarEstudante(id: string, operadorId: string) {
  return alterarStatus(id, operadorId, "APROVADO", undefined, true);
}

export async function listarComprovantes(usuarioId: string, { pagina, limite }: z.infer<typeof listarComprovantesSchema>) {
  const estudante = await prisma.estudante.findUnique({
    where: { usuarioId },
    select: { id: true },
  });
  if (!estudante) throw new HttpError(404, "Cadastro acadêmico não encontrado");
  const registros = await prisma.comprovanteMatricula.findMany({
    where: { estudanteId: estudante.id }, skip: (pagina - 1) * limite, take: limite + 1,
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }], select: comprovanteSelect,
  });
  return { dados: registros.slice(0, limite).map(comprovanteDto),
    meta: { pagina, limite, temProxima: registros.length > limite } };
}

export async function enviarComprovante(usuarioId: string, recebido: ArquivoRecebido) {
  const estudante = await prisma.estudante.findUnique({
    where: { usuarioId },
    select: { id: true },
  });
  if (!estudante) throw new HttpError(404, "Cadastro acadêmico não encontrado");
  if (recebido.conteudo.byteLength > TAMANHO_MAXIMO_COMPROVANTE) {
    throw new HttpError(413, "O comprovante deve ter no máximo 10 MB");
  }
  let tipo;
  try { tipo = await fileTypeFromBuffer(recebido.conteudo); }
  catch { throw new HttpError(400, "Não foi possível identificar o formato do arquivo"); }
  if (!tipo || !["application/pdf", "image/jpeg", "image/png"].includes(tipo.mime)) {
    throw new HttpError(415, "Envie um comprovante em PDF, JPEG ou PNG");
  }
  const arquivo = arquivoComprovanteSchema.parse({ ...recebido, tipoMime: tipo.mime });
  const salvo = await comprovantesStorage.salvar(arquivo.conteudo);

  try {
    const comprovante = await prisma.comprovanteMatricula.create({
      data: {
        chaveArquivo: salvo.chave,
        nomeOriginal: arquivo.nomeOriginal,
        tipoMime: arquivo.tipoMime,
        tamanhoBytes: arquivo.tamanhoBytes,
        estudanteId: estudante.id,
        enviadoPorId: usuarioId,
      },
      select: comprovanteSelect,
    });
    return comprovanteDto(comprovante);
  } catch (erro) {
    try { await salvo.remover(); } catch { console.error("Falha ao remover comprovante órfão após erro de persistência"); }
    throw erro;
  }
}
