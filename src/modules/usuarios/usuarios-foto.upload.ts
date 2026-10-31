import multer from "multer";
import type { RequestHandler } from "express";
import { HttpError } from "../../shared/errors/http-error";

export const MAX_FOTO_BYTES = 5 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: {
  fileSize: MAX_FOTO_BYTES, files: 1, fields: 1, fieldSize: 4000, parts: 2,
} }).single("foto");

export const receberFoto: RequestHandler = (req, res, next) => {
  if (!req.is("multipart/form-data")) { next(new HttpError(415, "Envie a foto por multipart/form-data")); return; }
  upload(req, res, (erro: unknown) => {
    if (erro) {
      const grande = erro instanceof multer.MulterError && erro.code === "LIMIT_FILE_SIZE";
      next(new HttpError(grande ? 413 : 400, grande ? "A foto deve ter no máximo 5 MB" : "Envie uma foto e o motivo da alteração"));
      return;
    }
    next();
  });
};
