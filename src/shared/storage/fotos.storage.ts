import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";

function caminho(chave: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chave)) throw new Error("Chave de foto inválida");
  return join(resolve(process.env.FOTOS_DIR ?? ".private/fotos"), chave);
}

export const fotosStorage = {
  async salvar(conteudo: Buffer) {
    const diretorio = resolve(process.env.FOTOS_DIR ?? ".private/fotos");
    await mkdir(diretorio, { recursive: true, mode: 0o700 });
    const chave = randomUUID();
    await writeFile(caminho(chave), conteudo, { flag: "wx", mode: 0o600 });
    return chave;
  },
  ler: (chave: string) => readFile(caminho(chave)),
  async remover(chave: string) {
    try { await unlink(caminho(chave)); }
    catch (erro) { if (!(erro && typeof erro === "object" && "code" in erro && erro.code === "ENOENT")) throw erro; }
  },
};
