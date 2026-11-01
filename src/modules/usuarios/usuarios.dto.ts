import type { Prisma } from "../../../generated/prisma";

export const usuarioSelect = {
  id: true, nome: true, email: true, telefone: true,
  perfil: true, status: true, criadoEm: true, atualizadoEm: true,
  dataNascimento: true, fotoChave: true,
  estudante: { select: {
    id: true, curso: true,
    cidadeOrigem: { select: { id: true, nome: true, ativa: true } },
    unidadeEnsino: { select: { id: true, nome: true, instituicaoEnsino: { select: { id: true, nome: true } } } },
  } },
} as const;
export const usuarioListaSelect = {
  id: true, nome: true, perfil: true, status: true, criadoEm: true,
} as const;

type Usuario = Prisma.UsuarioGetPayload<{ select: typeof usuarioSelect }>;

export function usuarioDto(usuario: Usuario) {
  return {
    id: usuario.id, nome: usuario.nome, email: usuario.email, telefone: usuario.telefone,
    perfil: usuario.perfil, status: usuario.status, criadoEm: usuario.criadoEm, atualizadoEm: usuario.atualizadoEm,
    dataNascimento: usuario.dataNascimento?.toISOString().slice(0, 10) ?? null,
    fotoUrl: usuario.fotoChave ? `/api/v1/usuarios/${usuario.id}/foto` : null,
    estudante: usuario.estudante ? {
      id: usuario.estudante.id, curso: usuario.estudante.curso,
      cidadeOrigem: usuario.estudante.cidadeOrigem ? { id: usuario.estudante.cidadeOrigem.id,
        nome: usuario.estudante.cidadeOrigem.nome, ativa: usuario.estudante.cidadeOrigem.ativa } : null,
      unidadeEnsino: { id: usuario.estudante.unidadeEnsino.id, nome: usuario.estudante.unidadeEnsino.nome,
        instituicaoEnsino: { id: usuario.estudante.unidadeEnsino.instituicaoEnsino.id,
          nome: usuario.estudante.unidadeEnsino.instituicaoEnsino.nome } },
    } : null,
  };
}
