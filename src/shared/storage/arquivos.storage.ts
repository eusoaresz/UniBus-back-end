import { randomUUID } from "node:crypto";
import { prisma } from "../../../lib/prisma";

// Os bytes ficam no banco: o disco do servidor no Render é apagado a cada reinício ou deploy.
export const arquivosPrivados = {
  async salvar(conteudo: Buffer) {
    const chave = randomUUID();
    await prisma.arquivoPrivado.create({ data: { chave, conteudo: new Uint8Array(conteudo) } });
    return chave;
  },
  async ler(chave: string) {
    const arquivo = await prisma.arquivoPrivado.findUnique({ where: { chave }, select: { conteudo: true } });
    // Mesmo código de "arquivo inexistente" do sistema de arquivos, que os serviços já tratam como 404.
    if (!arquivo) throw Object.assign(new Error("Arquivo não encontrado"), { code: "ENOENT" });
    return Buffer.from(arquivo.conteudo);
  },
  async remover(chave: string) {
    await prisma.arquivoPrivado.deleteMany({ where: { chave } });
  },
};
