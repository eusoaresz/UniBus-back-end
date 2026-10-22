# Arquitetura do UniBus backend

API Express, TypeScript, PostgreSQL, Prisma e JWT.

## Implementado

- `src/app.ts`: composição, aliases temporários, limite de corpo, respostas sem cache e erros.
- `src/modules/usuarios/`: cadastro administrativo, paginação, consulta, edição própria e status.
- `src/modules/auth/`: login, recuperação e redefinição de senha.
- `src/shared/middlewares/`: JWT, conta/perfil atuais, autorização e limites locais de tentativas.
- `src/shared/errors/`: erros sem exposição de dados internos.
- `lib/prisma.ts`: cliente sem logs de consultas ou parâmetros pessoais.
- `lib/mailer.ts`: sandbox Mailtrap.
- `prisma/`: schema e migração inicial, sem alteração nesta reorganização.

Módulos separam rotas, controllers, schemas, serviços e seleção de saída. CRUD de identidade não cria cadastro acadêmico/operacional. Não existe exclusão física pública de usuário.

Veja [contratos, testes e limitações](usuarios.md) e [requisições manuais](usuarios.http).

## Próximos domínios

Estudantes, motoristas, instituições, pontos, rotas, veículos, escalas, viagens, participações, embarques, carteira e comunicação. Tabelas não significam fluxos implementados.

## Antes de produção

Provisionamento seguro do primeiro operador, verificação de e-mail, sessões revogáveis, auditoria administrativa persistente, limitador compartilhado, SMTP real e testes com PostgreSQL para concorrência/rollback. Configurar TLS, acesso restrito ao banco/arquivos/backups e monitoramento sem dados pessoais.
