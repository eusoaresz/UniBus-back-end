# UniBus — backend

API em desenvolvimento para gestão de transporte de estudantes, construída com Node.js, TypeScript, Express, PostgreSQL e Prisma.

O módulo de usuários implementa cadastro por operador, listagem restrita, login e recuperação de senha. O módulo de viagens implementa criação, consulta e edição de rascunhos por operador. Consulte [o contrato de viagens e a preparação da migração](docs/viagens.md) e [a arquitetura e as pendências](docs/arquitetura.md).

A carteira manual implementa saldo, extrato, recargas Pix e dinheiro, análise pelo operador, estorno integral e serviço interno de débito. Veja [o contrato da carteira](docs/carteira.md) e [as instruções para abrir a cópia de revisão](ABRIR-PROJETO.md). A integração com confirmação de viagem ainda não está implementada.

## Executar localmente

Requisitos: Node.js 24, npm, PostgreSQL e uma conta de sandbox SMTP no Mailtrap.

1. Instale as dependências com `npm ci` (incluindo dependências de desenvolvimento, pois o servidor usa `tsx`).
2. Copie `.env.example` para `.env` e preencha os valores locais. Não versione esse arquivo.
3. Gere um segredo JWT aleatório, por exemplo com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
4. Execute `npm run prisma:generate` e `npm run prisma:validate`.
5. Aponte `DATABASE_URL` para um banco de desenvolvimento. Antes de executar `npm run prisma:migrate`, revise a preparação de dados em [viagens](docs/viagens.md), principalmente se houver viagens existentes. Coordene migrações em banco compartilhado.
6. Inicie com `npm run dev`. A porta padrão é 3000.

O e-mail utiliza `sandbox.smtp.mailtrap.io:2525`: as mensagens são capturadas no Mailtrap, sem entrega real aos usuários.

## Módulo reorganizado

Consulte [o contrato e os testes de usuários](docs/usuarios.md) e [as requisições manuais](docs/usuarios.http). As rotas canônicas são `/api/v1/usuarios` e `/api/v1/auth`; os caminhos antigos continuam temporariamente disponíveis. A listagem agora retorna `{ dados, meta }`; CPF não é retornado pela API. JWT_SECRET deve ter pelo menos 32 bytes.

## Rotas anteriores (aliases temporários)

| Método | Rota | Acesso |
|---|---|---|
| POST | `/usuarios` | Operador ativo |
| GET | `/usuarios` | Operador ativo |
| POST | `/usuarios/login` | Público; emite JWT somente para conta ativa |
| POST | `/usuarios/recuperar-senha` | Público |
| POST | `/usuarios/redefinir-senha` | Público; exige código válido |

Nas rotas protegidas, envie `Authorization: Bearer <token>`. O cadastro recebe `nome`, `cpf` (11 dígitos), `email`, `telefone`, `senha` e `perfil` (`MOTORISTA` ou `OPERADOR`). A senha exige pelo menos oito caracteres, maiúscula, minúscula, número e símbolo.

O login recebe `email` e `senha`; a solicitação de recuperação recebe `email`; a redefinição recebe `email`, `codigo` de seis dígitos e `novaSenha`.

**Limitação atual:** novas contas ficam aguardando ativação. Um operador pode alterar o status de outra conta em `PATCH /api/v1/usuarios/:id/status`; isso não verifica e-mail nem aprova matrícula. O cadastro unificado de estudante em `/api/v1/estudantes` já cria matrícula aprovada e carteira; veja [o contrato](docs/estudantes.md). Para desenvolvimento, `npm run seed:local` prepara o primeiro operador apenas em PostgreSQL local, com credenciais fornecidas pelo desenvolvedor. Provisionamento administrativo de produção ainda precisa ser definido. Não existe senha padrão nem cadastro público de operador.

## Verificação

- `npm test`: regressões de autenticação/autorização e viagens com persistência simulada, além de migração SQL em PostgreSQL em memória.
- `npm run typecheck`: verificação de tipos após gerar o Prisma Client.
- `npm run prisma:validate`: validação do schema.
- `npm audit`: relatório atual de dependências.

Essas verificações não substituem testes com banco e SMTP reais.

Veja também [as dependências](docs/dependencias.md). Versione schema, migrações e `package-lock.json`; mantenha credenciais, `node_modules`, cliente gerado e logs fora do Git.
