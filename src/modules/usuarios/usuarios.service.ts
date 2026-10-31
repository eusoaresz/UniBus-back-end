import bcrypt from "bcrypt";
import type { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { HttpError } from "../../shared/errors/http-error";
import { criarUsuarioSchema, listarUsuariosSchema, statusSchema } from "./usuarios.schemas";
import { usuarioSelect, usuarioListaSelect, usuarioDto } from "./usuarios.dto";

export async function criarUsuario(dados: z.infer<typeof criarUsuarioSchema>, operadorId: string) {
  if (dados.perfil === "ESTUDANTE") throw new HttpError(409, "Cadastre o estudante em /api/v1/estudantes com os dados acadêmicos para criar sua carteira");
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

export function alterarStatus(id: string, operadorId: string, dados: z.infer<typeof statusSchema>) {
  if (id === operadorId) throw new HttpError(409, "Não é permitido alterar o próprio status nesta rota");
  return prisma.usuario.update({ where: { id }, data: { status: dados.status }, select: usuarioSelect }).then(usuarioDto);
}
