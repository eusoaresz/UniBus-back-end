# Cadastro acadêmico de estudantes

Todas as rotas ficam sob `/api/v1/estudantes` e exigem Bearer token de conta ativa.

| Método | Rota | Permissão |
|---|---|---|
| GET | `/me` | Estudante; consulta pelo usuário do token |
| GET | `/me/comprovantes` | Estudante; paginação `pagina`/`limite` |
| POST | `/me/comprovantes` | Estudante; upload multipart |
| POST | `/` | Operador; cadastro de usuário, estudante aprovado e carteira na mesma transação |
| GET | `/` | Operador; paginação e filtros `statusCadastro`, `unidadeEnsinoId` |
| GET | `/:id` | Operador; detalhe administrativo |
| PATCH | `/:id` | Operador; edição de cadastro não aprovado |
| POST | `/:id/aprovar` | Operador; PENDENTE ou REJEITADO → APROVADO |
| POST | `/:id/rejeitar` | Operador; PENDENTE → REJEITADO, exige motivo |
| POST | `/:id/suspender` | Operador; APROVADO → SUSPENSO, exige motivo |
| POST | `/:id/reativar` | Operador; SUSPENSO → APROVADO |

`:id` é o ID de Estudante, não de Usuario. Aprovação acadêmica não ativa a conta de login: `Usuario.status` continua controlado pelo módulo de usuários. O middleware atual exige conta ativa inclusive para enviar comprovante.

Cadastro recebe `nome`, `cpf`, `email`, `telefone`, `senha`, `matricula`, `previsaoConclusao` (YYYY-MM-DD) e `unidadeEnsinoId`. O operador cadastra com status acadêmico APROVADO, registrando responsável e data. Usuário, estudante e carteira são criados na mesma transação. A carteira nasce com saldo `"0.00"` e limite `"20.00"`. A conta permanece AGUARDANDO_ATIVACAO até o fluxo de ativação do módulo de usuários. Exige unidade, instituição e ponto de parada ativos. A matrícula é única por unidade, inclusive na edição quando apenas a unidade muda. CPF e e-mail continuam únicos. Campos internos, perfil e saldo enviados pelo cliente são rejeitados. Não aceita `usuarioId` para cadastro parcial. A rota genérica de usuários recusa novos estudantes e orienta usar este cadastro.

A antiga rota experimental `/api/v1/operador/estudantes` foi removida. Aprovação e rejeição permanecem para registros pendentes anteriores; novos cadastros não passam por segunda aprovação acadêmica. Aprovação e reativação garantem carteira sem zerar saldos existentes. O detalhe administrativo inclui ID, saldo e limite da carteira, com valores decimais em texto.Os testes integrados em `tests/carteira.test.ts` usam a API, Prisma e PGlite. Cobrem cadastro atômico, matrícula por unidade na criação/edição, acesso ao perfil, suspensão/reativação, carteira de cadastro legado e rejeição de caminhos incompletos. A migração da carteira também cobre estudantes antigos sem carteira. As transações ainda precisam de ensaio com múltiplas conexões em PostgreSQL real. Nenhum dado do Neon foi modificado. O upload também é exercitado por HTTP com arquivo PNG, gravação em diretório temporário, isolamento por estudante e rejeição de formato falso e campos adicionais.
