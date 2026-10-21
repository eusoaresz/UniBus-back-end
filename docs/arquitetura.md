# Arquitetura do UniBus backend

## Implementado

API Express em TypeScript, persistência PostgreSQL com Prisma e autenticação JWT.

- `src/app.ts`: composição da aplicação e montagem de `/usuarios`.
- `src/server.ts`: inicialização HTTP.
- `src/modules/usuarios.ts`: cadastro, listagem, login e recuperação de senha.
- `src/modules/middlewares/auth.ts`: validação do JWT, consulta do estado atual da conta e autorização de operadores.
- `lib/prisma.ts`: cliente de banco de dados.
- `lib/mailer.ts`: envio para o sandbox de testes do Mailtrap.
- `prisma/schema.prisma` e `prisma/migrations/`: modelo e histórico do banco.

Cadastro e listagem exigem operador ativo. O perfil enviado no cadastro só é aceito após essa autorização. O responsável é salvo em `cadastradoPorId`. Login e rotas protegidas exigem conta `ATIVA`; permissões e estado são consultados no banco a cada requisição protegida.

Novas contas continuam como `AGUARDANDO_ATIVACAO`. A recuperação de senha não ativa contas. O fluxo de ativação e o provisionamento seguro do primeiro operador ainda precisam ser implementados; não há cadastro público nem credenciais padrão.

## Planejado

O schema contém domínios que ainda não possuem rotas: estudantes, motoristas, instituições, rotas, veículos, viagens, reservas, embarques, carteira e notificações. A presença de uma tabela não significa que sua funcionalidade esteja pronta.

Conforme esses fluxos forem implementados, separar os módulos por domínio, extraindo validações e casos de uso das rotas. Operações compostas devem usar transações; alterações financeiras devem manter valores em centavos, idempotência e auditoria. Transições de status e permissões devem ser verificadas no servidor.

## Pendências antes de produção

- Implementar e testar ativação de contas e criação segura do operador inicial.
- Limitar tentativas de login e recuperação de senha.
- Garantir consumo único do código de recuperação sob concorrência e definir invalidação de sessões após troca de senha.
- Paginar a listagem de usuários e revisar os dados pessoais necessários na resposta.
- Configurar transporte de e-mail de produção; o Mailtrap atual é um sandbox.
- Implementar testes de integração com PostgreSQL e entrega de e-mail.
- Investigar os resultados atuais de `npm audit`, sem aplicar atualizações incompatíveis automaticamente.
