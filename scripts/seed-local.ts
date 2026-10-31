import "dotenv/config";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma";
import { criarUsuarioSchema } from "../src/modules/usuarios/usuarios.schemas";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || process.env.NODE_ENV === "production") throw new Error("Seed permitido somente em PostgreSQL local de desenvolvimento");
  const operador = criarUsuarioSchema.parse({
    nome: process.env.SEED_OPERADOR_NOME ?? "Operador local",
    cpf: process.env.SEED_OPERADOR_CPF,
    email: process.env.SEED_OPERADOR_EMAIL,
    telefone: process.env.SEED_OPERADOR_TELEFONE ?? "53999999999",
    senha: process.env.SEED_OPERADOR_SENHA,
    perfil: "OPERADOR",
  });
  const { senha, ...dados } = operador;
  const senhaHash = await bcrypt.hash(senha, 10);
  await prisma.$transaction(async (tx) => {
    const existente = await tx.usuario.findUnique({ where: { cpf: dados.cpf } });
    if (existente && (existente.email !== dados.email || existente.perfil !== "OPERADOR")) throw new Error("CPF já utilizado em outro cadastro");
    if (!existente) await tx.usuario.create({ data: { ...dados, senhaHash, status: "ATIVA", deveAlterarSenha: true } });
    const instituicao = await tx.instituicaoEnsino.upsert({ where: { id: "10000000-0000-4000-8000-000000000001" }, update: {}, create: { id: "10000000-0000-4000-8000-000000000001", nome: "Instituição fictícia local", tipo: "FACULDADE" } });
    const pontos = [
      { id: "10000000-0000-4000-8000-000000000002", nome: "Prefeitura", cidade: "Pedro Osório" },
      { id: "10000000-0000-4000-8000-000000000003", nome: "Praça", cidade: "Pedro Osório" },
      { id: "10000000-0000-4000-8000-000000000004", nome: "Campus fictício", cidade: "Pelotas" },
    ];
    for (const ponto of pontos) await tx.pontoParada.upsert({ where: { id: ponto.id }, update: {}, create: ponto });
    await tx.unidadeEnsino.upsert({ where: { id: "10000000-0000-4000-8000-000000000005" }, update: {}, create: { id: "10000000-0000-4000-8000-000000000005", nome: "Campus fictício local", instituicaoEnsinoId: instituicao.id, pontoParadaId: pontos[2].id } });
    const rota = await tx.rota.upsert({ where: { id: "10000000-0000-4000-8000-000000000006" }, update: {}, create: { id: "10000000-0000-4000-8000-000000000006", nome: "Centro (teste local)" } });
    for (const [indice, ponto] of pontos.entries()) await tx.rotaParada.upsert({ where: { rotaId_pontoParadaId: { rotaId: rota.id, pontoParadaId: ponto.id } }, update: {}, create: { rotaId: rota.id, pontoParadaId: ponto.id, ordem: indice + 1 } });
  });
  console.log("Cadastro local preparado. Unidade: 10000000-0000-4000-8000-000000000005. Rota: 10000000-0000-4000-8000-000000000006.");
}
main().catch(() => { console.error("Não foi possível preparar o banco local. Verifique conexão, migrações e variáveis SEED_OPERADOR; nenhum cadastro parcial será mantido."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
