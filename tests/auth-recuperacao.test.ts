import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

process.env.JWT_SECRET = "segredo-exclusivo-dos-testes-sem-uso-real";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.MAILTRAP_USER = "test";
process.env.MAILTRAP_PASS = "test";
process.env.SMTP_FROM = "test@example.com";

let prisma: typeof import("../lib/prisma").prisma;
let service: typeof import("../src/modules/auth/auth.service");
let codigoHash: string;
let usuarioExiste: boolean;
let tokenExiste: boolean;
let consumo: number;
let alteracoesSenha: number;
let emissao: any;
let email: any;
let bloqueios: number;
const restaurar: Array<() => void> = [];
const id = "00000000-0000-4000-8000-000000000001";

before(async () => {
  prisma = (await import("../lib/prisma")).prisma;
  service = await import("../src/modules/auth/auth.service");
  const { transporter } = await import("../lib/mailer");
  codigoHash = await bcrypt.hash("123456", 4);
  function substituir(alvo: any, chave: string, valor: any) {
    const original = alvo[chave];
    alvo[chave] = valor;
    restaurar.push(() => { alvo[chave] = original; });
  }
  substituir(prisma.usuario, "findUnique", async () => usuarioExiste ? { id } : null);
  substituir(prisma.tokenAcesso, "findFirst", async () => tokenExiste ? { id: "token", tokenHash: codigoHash } : null);
  substituir(prisma, "$transaction", async (callback: any) => callback({
    $queryRaw: async () => { bloqueios++; return [{ id }]; },
    tokenAcesso: {
      create: async (args: any) => { emissao = args.data; return { id: "novo-token" }; },
      updateMany: async (args: any) => {
        if (args.where.id) {
          assert.equal(args.where.utilizadoEm, null);
          assert.ok(args.where.expiraEm.gt instanceof Date);
          const count = consumo; consumo = 0; return { count };
        }
        return { count: 1 };
      },
    },
    usuario: { update: async (args: any) => {
      alteracoesSenha++;
      assert.equal(await bcrypt.compare("NovaSenha123!", args.data.senhaHash), true);
      return {};
    } },
  }));
  substituir(transporter, "sendMail", async (args: any) => { email = args; return {}; });
});

beforeEach(() => {
  usuarioExiste = true; tokenExiste = true; consumo = 1;
  alteracoesSenha = 0; bloqueios = 0; emissao = undefined; email = undefined;
});
after(async () => { restaurar.reverse().forEach((fn) => fn()); await prisma.$disconnect(); });

test("recuperação não emite código para conta inexistente", async () => {
  usuarioExiste = false;
  await service.recuperarSenha("ausente@example.com");
  assert.equal(emissao, undefined);
  assert.equal(email, undefined);
});

test("recuperação armazena somente hash e envia código com validade", async () => {
  await service.recuperarSenha("teste@example.com");
  const codigo = email.text.match(/\b\d{6}\b/)[0];
  assert.equal(await bcrypt.compare(codigo, emissao.tokenHash), true);
  assert.notEqual(emissao.tokenHash, codigo);
  assert.ok(emissao.expiraEm.getTime() > Date.now());
  assert.equal(bloqueios, 1);
});

test("redefinição válida consome código e altera hash na transação", async () => {
  await service.redefinirSenha({ email: "teste@example.com", codigo: "123456", novaSenha: "NovaSenha123!" });
  assert.equal(alteracoesSenha, 1);
  assert.equal(bloqueios, 1);
});

test("código já consumido entre leitura e atualização não altera senha", async () => {
  consumo = 0;
  await assert.rejects(service.redefinirSenha({ email: "teste@example.com", codigo: "123456", novaSenha: "NovaSenha123!" }), /Código inválido/);
  assert.equal(alteracoesSenha, 0);
});

test("código incorreto não inicia alteração de senha", async () => {
  await assert.rejects(service.redefinirSenha({ email: "teste@example.com", codigo: "999999", novaSenha: "NovaSenha123!" }), /Código inválido/);
  assert.equal(alteracoesSenha, 0);
  assert.equal(bloqueios, 0);
});

test("código ausente ou expirado não altera senha", async () => {
  tokenExiste = false;
  await assert.rejects(service.redefinirSenha({ email: "teste@example.com", codigo: "123456", novaSenha: "NovaSenha123!" }), /Código inválido/);
  assert.equal(alteracoesSenha, 0);
});
