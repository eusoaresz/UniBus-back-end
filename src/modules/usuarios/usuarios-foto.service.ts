import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { prisma } from "../../../lib/prisma";
import { fotosStorage } from "../../shared/storage/fotos.storage";
import { HttpError } from "../../shared/errors/http-error";
import { transacaoPerfil } from "./usuarios-dados.service";
import { MAX_FOTO_BYTES } from "./usuarios-foto.upload";

export async function normalizarFoto(conteudo: Buffer) {
  if (!conteudo.length) throw new HttpError(400, "A foto está vazia");
  if (conteudo.length > MAX_FOTO_BYTES) throw new HttpError(413, "A foto deve ter no máximo 5 MB");
  let tipo;
  try { tipo = await fileTypeFromBuffer(conteudo); } catch { throw new HttpError(400, "Foto inválida"); }
  if (!tipo || !["image/jpeg", "image/png"].includes(tipo.mime)) throw new HttpError(415, "Envie uma foto JPEG ou PNG");
  try {
    const imagem = sharp(conteudo, { limitInputPixels: 16000000, failOn: "warning" });
    const metadata = await imagem.metadata();
    if ((metadata.pages ?? 1) !== 1) throw new Error("Imagem com múltiplos quadros");
    return await imagem.rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
  } catch { throw new HttpError(400, "Foto inválida ou acima do limite de 16 megapixels"); }
}

async function limparFoto(chave: string | null) {
  if (!chave) return;
  try { await fotosStorage.remover(chave); } catch { console.error("Falha ao remover arquivo de foto sem referência"); }
}

export async function alterarFoto(id: string, operadorId: string, motivo: string, conteudo: Buffer | null) {
  const chave = conteudo ? await fotosStorage.salvar(await normalizarFoto(conteudo)) : null;
  let anterior: string | null;
  try {
    anterior = await transacaoPerfil(operadorId, async (tx) => {
      const usuario = await tx.usuario.findUnique({ where: { id }, select: { fotoChave: true } });
      if (!usuario) throw new HttpError(404, "Usuário não encontrado");
      await tx.usuario.update({ where: { id }, data: { fotoChave: chave } });
      if (usuario.fotoChave !== chave) await tx.alteracaoPerfil.create({ data: {
        usuarioId: id, realizadaPorId: operadorId, motivo,
        dadosAnteriores: { fotoCadastrada: Boolean(usuario.fotoChave) }, dadosNovos: { fotoCadastrada: Boolean(chave) },
      } });
      return usuario.fotoChave;
    });
  } catch (erro) { await limparFoto(chave); throw erro; }
  if (anterior !== chave) await limparFoto(anterior);
  return { fotoUrl: chave ? `/api/v1/usuarios/${id}/foto` : null };
}

export async function consultarFoto(id: string, solicitanteId: string, perfil: string) {
  if (id !== solicitanteId && perfil !== "OPERADOR") throw new HttpError(403, "Sem permissão para consultar esta foto");
  const usuario = await prisma.usuario.findUnique({ where: { id }, select: { fotoChave: true } });
  if (!usuario?.fotoChave) throw new HttpError(404, "Foto não encontrada");
  try { return await fotosStorage.ler(usuario.fotoChave); }
  catch (erro) {
    if (erro && typeof erro === "object" && "code" in erro && erro.code === "ENOENT") throw new HttpError(404, "Foto não encontrada");
    throw erro;
  }
}
