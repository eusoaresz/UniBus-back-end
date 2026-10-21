# UniBus — backend

API em desenvolvimento para gestão de transporte de estudantes, construída com Node.js, TypeScript, Express, PostgreSQL e Prisma.

O módulo de usuários implementa cadastro por operador, listagem restrita, login e recuperação de senha. Os demais domínios existem no schema, mas suas APIs ainda não foram implementadas. Consulte [a arquitetura e as pendências](docs/arquitetura.md).

## Executar localmente

Requisitos: Node.js 24, npm, PostgreSQL e uma conta de sandbox SMTP no Mailtrap.

1. Instale as dependências com `npm ci` (incluindo dependências de desenvolvimento, pois o servidor usa `tsx`).
2. Copie `.env.example` para `.env` e preencha os valores locais. Não versione esse arquivo.
3. Gere um segredo JWT aleatório, por exemplo com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
4. Execute `npm run prisma:generate` e `npm run prisma:validate`.
5. Aponte `DATABASE_URL` para um banco de desenvolvimento e execute `npm run prisma:migrate` para aplicar as migrações.
6. Inicie com `npm run dev`. A porta padrão é 3000.

O e-mail utiliza `sandbox.smtp.mailtrap.io:2525`: as mensagens são capturadas no Mailtrap, sem entrega real aos usuários.

## Rotas disponíveis

| Método | Rota | Acesso |
|---|---|---|
| POST | `/usuarios` | Operador ativo |
| GET | `/usuarios` | Operador ativo |
| POST | `/usuarios/login` | Público; emite JWT somente para conta ativa |
| POST | `/usuarios/recuperar-senha` | Público |
| POST | `/usuarios/redefinir-senha` | Público; exige código válido |

Nas rotas protegidas, envie `Authorization: Bearer <token>`. O cadastro recebe `nome`, `cpf` (11 dígitos), `email`, `telefone`, `senha` e `perfil` (`ESTUDANTE`, `MOTORISTA` ou `OPERADOR`). A senha exige pelo menos oito caracteres, maiúscula, minúscula, número e símbolo.

O login recebe `email` e `senha`; a solicitação de recuperação recebe `email`; a redefinição recebe `email`, `codigo` de seis dígitos e `novaSenha`.

**Limitação atual:** novas contas ficam aguardando ativação. O fluxo de ativação e a criação segura do primeiro operador ainda não estão implementados. Um banco vazio não permite iniciar os cadastros pela API. Não existe usuário ou senha padrão; não abra o cadastro administrativo para contornar essa pendência.

## Verificação

- `npm test`: regressões de autenticação/autorização com banco simulado.
- `npm run typecheck`: verificação de tipos após gerar o Prisma Client.
- `npm run prisma:validate`: validação do schema.
- `npm audit`: relatório atual de dependências.

Essas verificações não substituem testes com banco e SMTP reais.

Veja também [as dependências](docs/dependencias.md). Versione schema, migrações e `package-lock.json`; mantenha credenciais, `node_modules`, cliente gerado e logs fora do Git.
