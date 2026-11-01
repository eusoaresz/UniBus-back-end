import bcrypt from "bcrypt";
import type { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { HttpError } from "../../shared/errors/http-error";
import { atualizarMeSchema, criarUsuarioSchema, listarUsuariosSchema, statusSchema } from "./usuarios.schemas";
import { usuarioSelect, usuarioListaSelect, usuarioDto } from "./usuarios.dto";
import { transacaoPerfil } from "./usuarios-dados.service";

export async function criarUsuario(dados: z.infer<typeof criarUsuarioSchema>, operadorId: string) {
  if (dados.perfil === "ESTUDANTE") throw new HttpError(409, "Cadastre o estudante em /api/v1/estudantes com os dados acadêmicos para criar sua carteira");
  if (dados.perfil === "MOTORISTA") throw new HttpError(409, "Cadastre o motorista em /api/v1/motoristas com os dados da CNH");
  const { senha, dataNascimento, ...usuario } = dados;
  return usuarioDto(await prisma.usuario.create({
    data: { ...usuario, dataNascimento: dataNascimento ? new Date(`${dataNascimento}T00:00:00Z`) : null,
      senhaHash: await bcrypt.hash(senha, 10), cadastradoPorId: operadorId },
    select: usuarioSelect,
  }));
}

export async function listarUsuarios({ pagina, limite, perfil, status }: z.infer<typeof listarUsuariosSchema>) {
  const registros = await prisma.usuario.findMany({
    where: { perfil, status }, skip: (pagina - 1) * limite, take: limite + 1,
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }], select: usuarioListaSelect,
  });
  return { dados: registros.slice(0, limite), meta: { pagina, limite, temProxima: registros.length > limite } };
}

export async function consultarUsuario(id: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id }, select: usuarioSelect });
  if (!usuario) throw new HttpError(404, "Usuário não encontrado");
  return usuarioDto(usuario);
}

export async function alterarStatus(id: string, operadorId: string, dados: z.infer<typeof statusSchema>) {
  if (id === operadorId) throw new HttpError(409, "Não é permitido alterar o próprio status nesta rota");
  const alvo = await prisma.usuario.findUnique({ where: { id }, select: { perfil: true } });
  if (!alvo) throw new HttpError(404, "Usuário não encontrado");
  return transacaoPerfil(operadorId, async tx => {
    const anterior = await tx.usuario.findUnique({ where: { id }, select: { status: true, motorista: { select: { id: true } } } });
    if (!anterior) throw new HttpError(404, "Usuário não encontrado");
    if (dados.status !== "ATIVA" && anterior.motorista) {
      const vinculo = await tx.trechoViagem.findFirst({ where: {
        status: { in: ["ABERTO", "FECHADO", "EM_ANDAMENTO"] },
        OR: [{ motoristaId: anterior.motorista.id }, { motoristaExtraId: anterior.motorista.id }],
      }, select: { id: true } });
      if (vinculo) throw new HttpError(409, "Substitua o motorista ou encerre/cancele os trechos antes de desativar ou bloquear a conta");
    }
    const atualizado = await tx.usuario.update({ where: { id }, data: { status: dados.status }, select: usuarioSelect });
    await tx.alteracaoPerfil.create({ data: { usuarioId: id, realizadaPorId: operadorId, motivo: dados.motivo!,
      dadosAnteriores: { status: anterior.status }, dadosNovos: { status: dados.status } } });
    return usuarioDto(atualizado);
  });
}

export async function atualizarMe(id: string, dados: z.infer<typeof atualizarMeSchema>) {
  return usuarioDto(await prisma.usuario.update({ where: { id }, data: dados, select: usuarioSelect }));
}
