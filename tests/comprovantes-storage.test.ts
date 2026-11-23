import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PrismaClient } from "../generated/prisma";
import { adapterMemoria } from "./helpers/postgres-memoria";

process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
const db = new PGlite();
const prisma = new PrismaClient({ adapter: adapterMemoria(db) });

before(async () => {
  for (const pasta of readdirSync("prisma/migrations").filter((p) => /^\d/.test(p)).sort()) {
    await db.exec(readFileSync(`prisma/migrations/${pasta}/migration.sql`, "utf8"));
  }
  (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
});
after(async () => { await prisma.$disconnect(); await db.close(); });

test("comprovante fica no banco em chave opaca e permite compensação", async () => {
  const { comprovantesStorage } = await import("../src/shared/storage/comprovantes.storage");
  const bytes = Buffer.from("arquivo isolado de teste");
  const salvo = await comprovantesStorage.salvar(bytes);
  assert.match(salvo.chave, /^[0-9a-f-]{36}$/);
  const guardado = await prisma.arquivoPrivado.findUniqueOrThrow({ where: { chave: salvo.chave } });
  assert.deepEqual(Buffer.from(guardado.conteudo), bytes);
  await salvo.remover();
  assert.equal(await prisma.arquivoPrivado.count(), 0);
});

test("leitura de arquivo inexistente sinaliza ENOENT para virar 404", async () => {
  const { fotosStorage } = await import("../src/shared/storage/fotos.storage");
  const chave = await fotosStorage.salvar(Buffer.from("foto"));
  assert.deepEqual(await fotosStorage.ler(chave), Buffer.from("foto"));
  await fotosStorage.remover(chave);
  await assert.rejects(fotosStorage.ler(chave), (erro: any) => erro.code === "ENOENT");
});
