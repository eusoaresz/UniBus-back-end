# Usuários: estrutura, rotas e testes

## Organização

- `src/modules/usuarios/`: routes (permissões), controller (HTTP), schemas (Zod), service (regras/Prisma), dto (campos retornados).
- `src/modules/auth/`: rotas, controller, validações, serviço de autenticação e configuração JWT.
- `src/shared/middlewares/`: autenticação, autorização e limites de tentativas.
- `src/shared/errors/`: tratamento centralizado de validação, conflitos e falhas internas.

CPF não é retornado por nenhuma rota deste módulo. A listagem também omite contatos. Consulta própria e consulta individual por operador incluem e-mail e telefone. O CPF permanece armazenado no banco atual: proteção da API não substitui acesso restrito ao banco, TLS, proteção de backups e eventual criptografia de campo conforme o modelo de ameaça.

## Rotas canônicas

| Método | Rota | Acesso |
|---|---|---|
| POST | `/api/v1/auth/login` | Público; conta ativa |
| POST | `/api/v1/auth/recuperar-senha` | Público; resposta genérica |
| POST | `/api/v1/auth/redefinir-senha` | Código válido, não expirado e não utilizado |
| POST | `/api/v1/usuarios` | Operador ativo |
| GET | `/api/v1/usuarios` | Operador ativo; paginação |
| GET | `/api/v1/usuarios/me` | Próprio usuário ativo |
| PATCH | `/api/v1/usuarios/me` | Próprio usuário; nome e telefone |
| GET | `/api/v1/usuarios/:id` | Operador ativo |
| PATCH | `/api/v1/usuarios/:id/status` | Operador ativo; outra conta |

Os caminhos antigos `/usuarios` e `/usuarios/login`, `/usuarios/recuperar-senha`, `/usuarios/redefinir-senha` continuam como aliases temporários. A listagem mudou de array para `{ dados, meta }`: ajuste o cliente.

Filtros: `?pagina=1&limite=20&perfil=ESTUDANTE&status=ATIVA`. Limite máximo 100; filtros desconhecidos são rejeitados. `meta` contém `pagina`, `limite` e `temProxima`.

Cadastro recebe nome, cpf, email, telefone, senha e perfil (MOTORISTA ou OPERADOR). Estudantes usam `/api/v1/estudantes`, com dados acadêmicos, aprovação presencial e criação da carteira na mesma transação; tentar cadastrar ESTUDANTE pela rota genérica retorna 409. CPF aceita máscara e valida dígitos; telefone brasileiro exige DDD; e-mail é normalizado. Senha exige oito caracteres, maiúscula, minúscula, número e símbolo, com teto de 72 bytes (bcrypt). Campos extras são rejeitados. Conta criada fica AGUARDANDO_ATIVACAO.

Status aceitos: ATIVA, BLOQUEADA e INATIVA. Ativação administrativa não significa verificação do e-mail ou aprovação da matrícula. Operador não pode alterar seu próprio status. Exclusão é lógica: não existe DELETE físico. CPF, perfil e e-mail não são editados neste módulo; precisam de fluxos específicos de correção/verificação.

## Teste manual

Use `docs/usuarios.http` no REST Client do VS Code ou reproduza no Postman/Insomnia. Use somente banco de desenvolvimento.

1. Execute `npm ci`, `npm run prisma:generate` e `npm run prisma:validate`.
2. Configure `.env` com banco local, Mailtrap e JWT_SECRET aleatório com pelo menos 32 bytes. Não compartilhe credenciais.
3. Aplique migrações locais com `npm run prisma:migrate`.
4. É necessário um operador ativo previamente provisionado por processo administrativo confiável. Este ajuste não cria senha padrão nem modifica seu banco automaticamente.
5. Execute `npm run dev`.
6. Faça login com o operador e copie o token para a variável local do arquivo HTTP. Não versione tokens reais.
7. Cadastre dados fictícios: espere 201, sem CPF/hash na resposta.
8. Liste com paginação: documentos e contatos devem estar ausentes.
9. Ative a conta fictícia pelo endpoint de status e faça login com ela.
10. Com estudante: `GET /me` retorna 200; listagem retorna 403; edição de perfil por `PATCH /me` retorna 400.
11. Bloqueie o estudante com operador e repita `/me` com JWT anterior: espere 403.
12. Solicite recuperação, consulte o código no Mailtrap e redefina. Reutilizar o código retorna 400.

## Testes automatizados

- `npm test`
- `npm run typecheck`
- `npm run prisma:validate`

Testes HTTP usam uma porta temporária em 127.0.0.1. Prisma e SMTP são simulados, sem alterar banco nem enviar e-mails. Verificam permissões atuais, documentos omitidos, validações, paginação, edição restrita, status, limites e consumo condicional de código.

É necessário complementar com PostgreSQL real para comprovar concorrência, bloqueios e rollback sob falhas. Os testes simulados não comprovam essas propriedades do banco.

## Limites e próximos passos

- Primeiro operador ainda exige provisionamento administrativo; não há bootstrap público.
- Cadastro cria Usuario; Estudante, Motorista e Carteira serão tratados nos próximos módulos.
- JWT expira em uma hora. Trocar a senha ainda não revoga JWTs existentes; implementar sessões revogáveis antes de produção. Bloqueio de conta já afeta requisições seguintes.
- Limitador em memória por IP e e-mail: login 30, recuperação 5 e redefinição 10 por 15 minutos. Reinicia com o processo; múltiplas instâncias exigem armazenamento compartilhado. Configurar proxy confiável explicitamente; não habilitar trust proxy indiscriminadamente.
- SMTP continua no sandbox Mailtrap. Falha de entrega invalida o código novo e mantém resposta genérica.
- Falta auditoria persistente de alterações administrativas de status.
- Não houve migração ou alteração do banco neste ajuste.
