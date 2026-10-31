import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "../generated/prisma";
import {
  estudanteMeDto, estudanteDetalheDto, estudanteListaDto, comprovanteDto,
  estudanteMeSelect, estudanteDetalheSelect, estudanteListaSelect, comprovanteSelect,
} from "../src/modules/estudantes/estudantes.dto";

const data = new Date("2026-10-31T12:00:00Z");
const registro = {
  curso: null, cidadeOrigem: null,
  id: "estudante", matricula: "001", previsaoConclusao: new Date("2028-12-31T00:00:00Z"),
  statusCadastro: "PENDENTE" as const, analisadoEm: null, criadoEm: data, atualizadoEm: data,
  observacaoAnalise: "Anotação interna", analisadoPor: { id: "operador", nome: "Operador", cpf: "privado" },
  usuario: { id: "usuario", nome: "Maria", email: "teste@example.com", telefone: "53991234567",
    dataNascimento: null, fotoChave: null,
    perfil: "ESTUDANTE" as const, status: "ATIVA" as const, cpf: "privado", senhaHash: "privado" },
  unidadeEnsino: { id: "unidade", nome: "Campus", endereco: null, ativa: true,
    instituicaoEnsino: { id: "instituicao", nome: "Universidade", tipo: "FACULDADE" as const, ativa: true } },
  comprovantes: [{ chaveArquivo: "privada" }],
  carteira: { id: "carteira", saldo: new Prisma.Decimal("12.50"), limiteCredito: new Prisma.Decimal("20.00") },
};

test("perfil próprio omite campos internos inclusive quando recebidos a mais", () => {
  const dto = estudanteMeDto(registro);
  assert.equal(dto.previsaoConclusao, "2028-12-31");
  assert.equal(dto.analisadoEm, null);
  assert.equal(dto.criadoEm, data.toISOString());
  for (const campo of ["observacaoAnalise", "analisadoPor", "comprovantes", "carteira"]) {
    assert.equal(campo in dto, false);
    assert.equal(campo in estudanteMeSelect, false);
  }
  assert.equal("cpf" in dto.usuario, false);
  assert.equal("senhaHash" in dto.usuario, false);
});
test("detalhe inclui análise somente no contrato administrativo", () => {
  const dto = estudanteDetalheDto(registro);
  assert.equal(dto.observacaoAnalise, registro.observacaoAnalise);
  assert.deepEqual(dto.analisadoPor, { id: "operador", nome: "Operador" });
  assert.deepEqual(dto.carteira, { id: "carteira", saldo: "12.50", limiteCredito: "20.00" });
  assert.equal(estudanteDetalheDto({ ...registro, analisadoPor: null }).analisadoPor, null);
  assert.equal(estudanteDetalheDto({ ...registro, carteira: null }).carteira, null);
  assert.equal("comprovantes" in estudanteDetalheSelect, false);
});
test("listagem obtém nome da relação e não expõe contatos ou análise", () => {
  const dto = estudanteListaDto(registro);
  assert.equal(dto.nomeCompleto, "Maria");
  assert.deepEqual(estudanteListaSelect.usuario.select, { nome: true });
  for (const campo of ["usuario", "observacaoAnalise", "comprovantes", "previsaoConclusao"]) {
    assert.equal(campo in dto, false);
  }
});
test("comprovante nunca devolve chave de armazenamento", () => {
  const dto = comprovanteDto({ id: "arquivo", nomeOriginal: "matricula.pdf", tipoMime: "application/pdf",
    tamanhoBytes: 50, criadoEm: data, atualizadoEm: data, ...{ chaveArquivo: "privada" } });
  assert.equal("chaveArquivo" in dto, false);
  assert.equal("chaveArquivo" in comprovanteSelect, false);
  assert.equal(dto.criadoEm, data.toISOString());
});
