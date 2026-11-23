import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enviarComprovanteSchema, arquivoComprovanteSchema, TAMANHO_MAXIMO_COMPROVANTE,
} from "../src/modules/estudantes/estudantes.schemas";

const arquivo = { nomeOriginal: "matricula.pdf", tipoMime: "application/pdf", conteudo: Buffer.from("conteudo de teste") };

test("body não aceita chave, proprietário, tamanho ou tipo declarados pelo cliente", () => {
  assert.equal(enviarComprovanteSchema.safeParse({}).success, true);
  for (const campo of ["chaveArquivo", "estudanteId", "enviadoPorId", "tipoMime", "tamanhoBytes"]) {
    assert.equal(enviarComprovanteSchema.safeParse({ [campo]: "indevido" }).success, false);
  }
});
test("metadados internos calculam tamanho pelos bytes recebidos", () => {
  const dados = arquivoComprovanteSchema.parse(arquivo);
  assert.equal(dados.tamanhoBytes, arquivo.conteudo.byteLength);
  assert.equal(arquivoComprovanteSchema.safeParse({ ...arquivo, tamanhoBytes: 1 }).success, false);
});
test("aceita somente PDF, JPEG e PNG detectados pelo serviço", () => {
  for (const tipoMime of ["application/pdf", "image/jpeg", "image/png"]) {
    assert.equal(arquivoComprovanteSchema.safeParse({ ...arquivo, tipoMime }).success, true);
  }
  assert.equal(arquivoComprovanteSchema.safeParse({ ...arquivo, tipoMime: "image/svg+xml" }).success, false);
});
test("rejeita arquivo vazio, acima do limite ou sem bytes", () => {
  for (const conteudo of [Buffer.alloc(0), Buffer.alloc(TAMANHO_MAXIMO_COMPROVANTE + 1), "arquivo.pdf"]) {
    assert.equal(arquivoComprovanteSchema.safeParse({ ...arquivo, conteudo }).success, false);
  }
});
test("nome original não pode conter caminhos ou caracteres de controle", () => {
  for (const nomeOriginal of ["../matricula.pdf", "C:\\matricula.pdf", "matricula\u0000.pdf", ".", "..", ""]) {
    assert.equal(arquivoComprovanteSchema.safeParse({ ...arquivo, nomeOriginal }).success, false);
  }
});
