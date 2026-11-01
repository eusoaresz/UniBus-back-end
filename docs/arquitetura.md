# Arquitetura do UniBus backend

API Express, TypeScript, PostgreSQL, Prisma e JWT.

## Implementado

- `src/app.ts`: composição, aliases temporários, limite de corpo, respostas sem cache e erros.
- `src/modules/usuarios/`: cadastro administrativo, paginação, consulta, edição própria e status.
- `src/modules/estudantes/`: cadastro unificado com carteira, perfil acadêmico, análise e comprovantes.
- `src/modules/avisos/`: publicação e gestão de avisos por perfil.
- `src/modules/auth/`: login, recuperação e redefinição de senha.
- `src/modules/viagens/`: criação, listagem, consulta e edição de rascunhos por operador, com os dois trechos e histórico de edição.
- `src/modules/carteira/`: saldo, extrato, recarga manual, análise, estorno e serviço interno de débito.
- `scripts/seed-local.ts`: preparação repetível de dados fictícios e operador, restrita a banco local.
- `src/shared/middlewares/`: JWT, conta/perfil atuais, autorização e limites locais de tentativas.
- `src/shared/errors/`: erros sem exposição de dados internos.
- `lib/prisma.ts`: cliente sem logs de consultas ou parâmetros pessoais.
- `lib/mailer.ts`: sandbox Mailtrap.
- `prisma/`: schema, migração inicial e migração de viagens com conversão monetária e preservação de históricos.

Módulos separam rotas, controllers, schemas, serviços e seleção de saída. CRUD de identidade não cria cadastro acadêmico/operacional. Não existe exclusão física pública de usuário.

Veja [contratos, testes e limitações](usuarios.md) e [requisições manuais](usuarios.http).

## Próximos domínios

Escalas recorrentes e comunicação externa. Os fluxos de status de contas, edição acadêmica e avisos possuem auditoria; encerramento e reabertura de estudantes estão implementados conforme seus contratos. Tabelas não significam fluxos implementados. Veja [o escopo atual de viagens](viagens.md) e [da carteira](carteira.md).

## Antes de produção

Provisionamento seguro do primeiro operador, verificação de e-mail, sessões revogáveis, política de consulta e retenção das auditorias administrativas, limitador compartilhado, SMTP real e testes com PostgreSQL para concorrência/rollback. Configurar TLS, acesso restrito ao banco/arquivos/backups e monitoramento sem dados pessoais.

## Operação integrada

O módulo de operação implementa publicação, recursos, fila, confirmação com cobrança, embarque, execução, disciplina e troca conjunta de rota com resolução dos passageiros. Preferências próprias, correções administrativas de perfil e fotos privadas também estão implementadas.

O módulo de motoristas implementa cadastro unificado ativo, complemento de contas existentes, consulta, edição da CNH e auditoria. Desativação exige resolução de vínculos operacionais e motivo.

O módulo de veículos implementa cadastro, consulta, edição, ativação/desativação e histórico administrativo, com proteção de vínculos operacionais e revisão da alocação após redução de capacidade.

O módulo de ensino administra instituições, unidades e pontos de parada, com histórico e bloqueios de desativação por vínculos. Alterações cadastrais preservam as paradas já salvas nas viagens.

O módulo de catálogos administra rotas e cidades com histórico. Mudanças de itinerário preservam viagens publicadas e exigem revisão dos rascunhos vinculados.
