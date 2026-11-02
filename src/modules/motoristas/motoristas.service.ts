import bcrypt from "bcrypt";
import type { z } from "zod";
import type { Prisma } from "../../../generated/prisma";
import { prisma } from "../../../lib/prisma";
import { HttpError } from "../../shared/errors/http-error";
import { transacaoPerfil } from "../usuarios/usuarios-dados.service";
import * as schemas from "./motoristas.schemas";

const select = { id: true, numeroCnh: true, categoriaCnh: true, validadeCnh: true,
  usuarioId: true, criadoEm: true, atualizadoEm: true,
  usuario: { select: { id: true, nome: true, email: true, telefone: true, status: true } },
} as const;
type Motorista = Prisma.MotoristaGetPayload<{ select: typeof select }>;
const dto = (m: Motorista) => ({ ...m, validadeCnh: m.validadeCnh.toISOString().slice(0, 10) });
const historico = (m: Motorista) => ({ motoristaId: m.id, numeroCnh: m.numeroCnh,
  categoriaCnh: m.categoriaCnh, validadeCnh: m.validadeCnh.toISOString().slice(0, 10) });

export async function criar(dados: z.infer<typeof schemas.criarMotoristaSchema>, operadorId: string) {
  const { numeroCnh, categoriaCnh, validadeCnh, senha, dataNascimento, ...pessoa } = dados;
  const senhaHash = await bcrypt.hash(senha, 10);
  return transacaoPerfil(operadorId, async tx => {
    const m = await tx.motorista.create({ data: { numeroCnh, categoriaCnh, validadeCnh: new Date(`${validadeCnh}T00:00:00Z`),
      usuario: { create: { ...pessoa, senhaHash, perfil: "MOTORISTA", status: "ATIVA", cadastradoPorId: operadorId,
        dataNascimento: dataNascimento ? new Date(`${dataNascimento}T00:00:00Z`) : null } },
    }, select });
    await tx.alteracaoPerfil.create({ data: { usuarioId: m.usuarioId, realizadaPorId: operadorId,
      motivo: "Cadastro completo de motorista", dadosAnteriores: {}, dadosNovos: historico(m) } });
    return dto(m);
  });
}

export function complementar(usuarioId: string, dados: z.infer<typeof schemas.complementarMotoristaSchema>, operadorId: string) {
  return transacaoPerfil(operadorId, async tx => {
    const usuario = await tx.usuario.findUnique({ where: { id: usuarioId }, select: { perfil: true, motorista: { select: { id: true } } } });
    if (!usuario) throw new HttpError(404, "Usuário não encontrado");
    if (usuario.perfil !== "MOTORISTA" || usuario.motorista) throw new HttpError(409, "Conta incompatível ou motorista já cadastrado");
    const { motivo, validadeCnh, ...cnh } = dados;
    const m = await tx.motorista.create({ data: { ...cnh, usuarioId, validadeCnh: new Date(`${validadeCnh}T00:00:00Z`) }, select });
    await tx.alteracaoPerfil.create({ data: { usuarioId, realizadaPorId: operadorId, motivo,
      dadosAnteriores: {}, dadosNovos: historico(m) } });
    return dto(m);
  });
}

export async function listar({ pagina, limite, nome, status }: z.infer<typeof schemas.listarMotoristasSchema>) {
  const registros = await prisma.motorista.findMany({ where: { usuario: { status, nome: nome ? { contains: nome, mode: "insensitive" } : undefined } },
    skip: (pagina - 1) * limite, take: limite + 1, orderBy: [{ criadoEm: "desc" }, { id: "desc" }], select });
  return { dados: registros.slice(0, limite).map(dto), meta: { pagina, limite, temProxima: registros.length > limite } };
}

export async function consultar(id: string) {
  const m = await prisma.motorista.findUnique({ where: { id }, select });
  if (!m) throw new HttpError(404, "Motorista não encontrado");
  return dto(m);
}

export function editar(id: string, dados: z.infer<typeof schemas.editarMotoristaSchema>, operadorId: string) {
  return transacaoPerfil(operadorId, async tx => {
    const anterior = await tx.motorista.findUnique({ where: { id }, select });
    if (!anterior) throw new HttpError(404, "Motorista não encontrado");
    const { motivo, validadeCnh, ...cnh } = dados;
    const m = await tx.motorista.update({ where: { id }, data: { ...cnh,
      validadeCnh: validadeCnh ? new Date(`${validadeCnh}T00:00:00Z`) : undefined }, select });
    await tx.alteracaoPerfil.create({ data: { usuarioId: m.usuarioId, realizadaPorId: operadorId, motivo,
      dadosAnteriores: historico(anterior), dadosNovos: historico(m) } });
    return dto(m);
  });
}
