import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { comprovantesStorage } from "../src/shared/storage/comprovantes.storage";

test("armazenamento grava os bytes em chave opaca e permite compensação", async () => {
  const diretorio = await mkdtemp(join(tmpdir(), "unibus-comprovante-teste-"));
  const anterior = process.env.COMPROVANTES_DIR;
  process.env.COMPROVANTES_DIR = diretorio;
  let salvo: Awaited<ReturnType<typeof comprovantesStorage.salvar>> | undefined;
  try {
    const bytes = Buffer.from("arquivo isolado de teste");
    salvo = await comprovantesStorage.salvar(bytes);
    assert.match(salvo.chave, /^[0-9a-f-]{36}$/);
    assert.deepEqual(await readFile(join(diretorio, salvo.chave)), bytes);
    await salvo.remover(); salvo = undefined;
    assert.deepEqual(await readdir(diretorio), []);
  } finally {
    if (salvo) await salvo.remover();
    if (anterior === undefined) delete process.env.COMPROVANTES_DIR;
    else process.env.COMPROVANTES_DIR = anterior;
    await rmdir(diretorio);
  }
});
