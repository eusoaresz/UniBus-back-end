import multer from "multer";
import type { RequestHandler } from "express";
import { HttpError } from "../../shared/errors/http-error";
import { TAMANHO_MAXIMO_COMPROVANTE } from "./estudantes.schemas";

const receber = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO_COMPROVANTE, files: 1, fields: 0, parts: 1 },
}).single("arquivo");

export const receberComprovante: RequestHandler = (req, res, next) => {
  if (!req.is("multipart/form-data")) {
    next(new HttpError(415, "Envie multipart/form-data com um arquivo no campo arquivo"));
    return;
  }
  receber(req, res, (erro: unknown) => {
    if (erro) {
      const grande = erro instanceof multer.MulterError && erro.code === "LIMIT_FILE_SIZE";
      next(new HttpError(grande ? 413 : 400,
        grande ? "O comprovante deve ter no máximo 10 MB" : "Upload inválido: envie somente um arquivo no campo arquivo"));
      return;
    }
    next();
  });
};
