import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";

// Não montar este diretório com express.static. Apenas nomes gerados internamente.
export const comprovantesStorage = {
  async salvar(conteudo: Buffer) {
    const diretorio = resolve(process.env.COMPROVANTES_DIR ?? ".private/comprovantes");
    await mkdir(diretorio, { recursive: true, mode: 0o700 });
    const chave = randomUUID();
    const caminho = join(diretorio, chave);
    await writeFile(caminho, conteudo, { flag: "wx", mode: 0o600 });
    return { chave, async remover() { await unlink(caminho); } };
  },
};
