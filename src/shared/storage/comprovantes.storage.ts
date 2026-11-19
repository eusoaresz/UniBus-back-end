import { arquivosPrivados } from "./arquivos.storage";

export const comprovantesStorage = {
  async salvar(conteudo: Buffer) {
    const chave = await arquivosPrivados.salvar(conteudo);
    return { chave, remover: () => arquivosPrivados.remover(chave) };
  },
};
