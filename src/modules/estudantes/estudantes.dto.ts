import type { Prisma } from "../../../generated/prisma";

const usuarioResumoSelect = {
  id: true, nome: true, email: true, telefone: true, perfil: true, status: true,
  dataNascimento: true, fotoChave: true,
} satisfies Prisma.UsuarioSelect;

const unidadeEnsinoSelect = {
  id: true, nome: true, endereco: true, ativa: true,
  instituicaoEnsino: { select: { id: true, nome: true, tipo: true, ativa: true } },
} satisfies Prisma.UnidadeEnsinoSelect;

export const comprovanteSelect = {
  id: true, nomeOriginal: true, tipoMime: true, tamanhoBytes: true,
  criadoEm: true, atualizadoEm: true,
} satisfies Prisma.ComprovanteMatriculaSelect;

export const estudanteMeSelect = {
  curso: true, cidadeOrigem: { select: { id: true, nome: true, ativa: true } },
  id: true, matricula: true, previsaoConclusao: true, statusCadastro: true,
  analisadoEm: true, criadoEm: true, atualizadoEm: true,
  usuario: { select: usuarioResumoSelect },
  unidadeEnsino: { select: unidadeEnsinoSelect },
} satisfies Prisma.EstudanteSelect;

export const estudanteDetalheSelect = {
  ...estudanteMeSelect,
  carteira: { select: { id: true, saldo: true, limiteCredito: true } },
  observacaoAnalise: true,
  analisadoPor: { select: { id: true, nome: true } },
} satisfies Prisma.EstudanteSelect;

export const estudanteListaSelect = {
  id: true, matricula: true, statusCadastro: true,
  usuario: { select: { nome: true } },
  unidadeEnsino: { select: {
    id: true, nome: true,
    instituicaoEnsino: { select: { id: true, nome: true } },
  } },
} satisfies Prisma.EstudanteSelect;

type EstudanteMe = Prisma.EstudanteGetPayload<{ select: typeof estudanteMeSelect }>;
type EstudanteDetalhe = Prisma.EstudanteGetPayload<{ select: typeof estudanteDetalheSelect }>;
type EstudanteLista = Prisma.EstudanteGetPayload<{ select: typeof estudanteListaSelect }>;
type Comprovante = Prisma.ComprovanteMatriculaGetPayload<{ select: typeof comprovanteSelect }>;

export function estudanteMeDto(estudante: EstudanteMe) {
  const { usuario, unidadeEnsino } = estudante;
  const instituicao = unidadeEnsino.instituicaoEnsino;
  return {
    id: estudante.id,
    curso: estudante.curso ?? null,
    cidadeOrigem: estudante.cidadeOrigem ? { id: estudante.cidadeOrigem.id, nome: estudante.cidadeOrigem.nome, ativa: estudante.cidadeOrigem.ativa } : null,
    matricula: estudante.matricula,
    previsaoConclusao: estudante.previsaoConclusao.toISOString().slice(0, 10),
    statusCadastro: estudante.statusCadastro,
    analisadoEm: estudante.analisadoEm?.toISOString() ?? null,
    criadoEm: estudante.criadoEm.toISOString(),
    atualizadoEm: estudante.atualizadoEm.toISOString(),
    usuario: {
      id: usuario.id, nome: usuario.nome, email: usuario.email, telefone: usuario.telefone,
      perfil: usuario.perfil, status: usuario.status,
      dataNascimento: usuario.dataNascimento?.toISOString().slice(0, 10) ?? null,
      fotoUrl: usuario.fotoChave ? `/api/v1/usuarios/${usuario.id}/foto` : null,
    },
    unidadeEnsino: {
      id: unidadeEnsino.id, nome: unidadeEnsino.nome, endereco: unidadeEnsino.endereco,
      ativa: unidadeEnsino.ativa,
      instituicaoEnsino: {
        id: instituicao.id, nome: instituicao.nome, tipo: instituicao.tipo, ativa: instituicao.ativa,
      },
    },
  };
}

export function estudanteDetalheDto(estudante: EstudanteDetalhe) {
  return {
    ...estudanteMeDto(estudante),
    carteira: estudante.carteira ? {
      id: estudante.carteira.id,
      saldo: estudante.carteira.saldo.toFixed(2),
      limiteCredito: estudante.carteira.limiteCredito.toFixed(2),
    } : null,
    observacaoAnalise: estudante.observacaoAnalise,
    analisadoPor: estudante.analisadoPor
      ? { id: estudante.analisadoPor.id, nome: estudante.analisadoPor.nome }
      : null,
  };
}

export function estudanteListaDto(estudante: EstudanteLista) {
  return {
    id: estudante.id,
    matricula: estudante.matricula,
    nomeCompleto: estudante.usuario.nome,
    statusCadastro: estudante.statusCadastro,
    unidadeEnsino: {
      id: estudante.unidadeEnsino.id,
      nome: estudante.unidadeEnsino.nome,
      instituicaoEnsino: {
        id: estudante.unidadeEnsino.instituicaoEnsino.id,
        nome: estudante.unidadeEnsino.instituicaoEnsino.nome,
      },
    },
  };
}

export function comprovanteDto(comprovante: Comprovante) {
  return {
    id: comprovante.id,
    nomeOriginal: comprovante.nomeOriginal,
    tipoMime: comprovante.tipoMime,
    tamanhoBytes: comprovante.tamanhoBytes,
    criadoEm: comprovante.criadoEm.toISOString(),
    atualizadoEm: comprovante.atualizadoEm.toISOString(),
  };
}

export const estudanteSelect = estudanteDetalheSelect;
export const estudanteDto = estudanteDetalheDto;
