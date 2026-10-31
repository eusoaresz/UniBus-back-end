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

async function validarCadastro(tx: Prisma.TransactionClient, dados: DadosCriacao) {
  const usuario = await tx.usuario.findUnique({
    where: { id: dados.usuarioId },
    select: { id: true, perfil: true, estudante: { select: { id: true } } },
  });
  if (!usuario) throw new HttpError(404, "Usuário não encontrado");
  if (usuario.perfil !== "ESTUDANTE") {
    throw new HttpError(409, "O usuário informado não possui perfil de estudante");
  }
  if (usuario.estudante) throw new HttpError(409, "O usuário já possui cadastro acadêmico");

  const matriculaExistente = await tx.estudante.findFirst({
    where: { matricula: dados.matricula },
    select: { id: true },
  });
  if (matriculaExistente) throw new HttpError(409, "A matrícula já está cadastrada");

  const unidade = await tx.unidadeEnsino.findUnique({
    where: { id: dados.unidadeEnsinoId },
    select: { id: true, ativa: true, instituicaoEnsino: { select: { ativa: true } } },
  });
  if (!unidade) throw new HttpError(404, "Unidade de ensino não encontrada");
  if (!unidade.ativa || !unidade.instituicaoEnsino.ativa) {
    throw new HttpError(409, "A unidade de ensino está inativa");
  }
}

export async function criarEstudante(dados: DadosCriacao) {
  return comTransacao(async (tx) => {
    await validarCadastro(tx, dados);
    const estudante = await tx.estudante.create({
      data: {
        matricula: dados.matricula,
        previsaoConclusao: new Date(`${dados.previsaoConclusao}T00:00:00.000Z`),
        usuarioId: dados.usuarioId,
        unidadeEnsinoId: dados.unidadeEnsinoId,
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
      select: { id: true, statusCadastro: true, matricula: true },
    });
    if (!atual) throw new HttpError(404, "Cadastro acadêmico não encontrado");
    if (atual.statusCadastro === "APROVADO") {
      throw new HttpError(409, "Cadastro aprovado não pode ser editado por esta rota");
    }

    if (dados.matricula && dados.matricula !== atual.matricula) {
      const duplicada = await tx.estudante.findFirst({
        where: { matricula: dados.matricula, id: { not: id } },
        select: { id: true },
      });
      if (duplicada) throw new HttpError(409, "A matrícula já está cadastrada");
    }
    if (dados.unidadeEnsinoId) {
      const unidade = await tx.unidadeEnsino.findUnique({
        where: { id: dados.unidadeEnsinoId },
        select: { ativa: true, instituicaoEnsino: { select: { ativa: true } } },
      });
      if (!unidade) throw new HttpError(404, "Unidade de ensino não encontrada");
      if (!unidade.ativa || !unidade.instituicaoEnsino.ativa) {
        throw new HttpError(409, "A unidade de ensino está inativa");
      }
    }

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
      select: { id: true, statusCadastro: true, usuarioId: true,
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
      if (!estudante.unidadeEnsino.ativa || !estudante.unidadeEnsino.instituicaoEnsino.ativa) {
        throw new HttpError(409, "A unidade de ensino está inativa");
      }
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
