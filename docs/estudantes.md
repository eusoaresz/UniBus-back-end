# Cadastro acadêmico de estudantes

Todas as rotas ficam sob `/api/v1/estudantes` e exigem Bearer token de conta ativa.

| Método | Rota | Permissão |
|---|---|---|
| GET | `/me` | Estudante; consulta pelo usuário do token |
| GET | `/me/comprovantes` | Estudante; paginação `pagina`/`limite` |
| POST | `/me/comprovantes` | Estudante; upload multipart |
| POST | `/` | Operador; cadastro acadêmico vinculado a usuário existente |
| GET | `/` | Operador; paginação e filtros `statusCadastro`, `unidadeEnsinoId` |
| GET | `/:id` | Operador; detalhe administrativo |
| PATCH | `/:id` | Operador; edição de cadastro não aprovado |
| POST | `/:id/aprovar` | Operador; PENDENTE ou REJEITADO → APROVADO |
| POST | `/:id/rejeitar` | Operador; PENDENTE → REJEITADO, exige motivo |
| POST | `/:id/suspender` | Operador; APROVADO → SUSPENSO, exige motivo |
| POST | `/:id/reativar` | Operador; SUSPENSO → APROVADO |

`:id` é o ID de Estudante, não de Usuario. Aprovação acadêmica não ativa a conta de login: `Usuario.status` continua controlado pelo módulo de usuários. O middleware atual exige conta ativa inclusive para enviar comprovante.

Cadastro recebe `usuarioId`, `matricula`, `previsaoConclusao` (YYYY-MM-DD) e `unidadeEnsinoId`. Cria status PENDENTE. Exige usuário ESTUDANTE sem cadastro acadêmico e unidade/instituição ativas. A regra atual impede matrícula repetida globalmente; revisar seu escopo caso instituições utilizem números iguais. Não há criação automática de carteira nesta etapa.

Aprovação aceita `{}` ou `{ "observacao": "texto" }`. Rejeição e suspensão recebem `{ "motivo": "justificativa" }`. Reativação aceita corpo vazio ou `{}`. Aprovação/reativação exigem unidade e instituição ativas e usuário ainda com perfil ESTUDANTE. As transições usam transação Serializable e atualização condicionada ao estado lido; conflito retorna 409, sem sobrescrever silenciosamente.

## Comprovantes no Bruno

Faça login como estudante ativo com cadastro acadêmico. Em POST `/me/comprovantes`, selecione Body → Multipart Form, adicione campo `arquivo` do tipo File e escolha PDF, JPEG ou PNG. Não envie JSON/Base64, chave, tamanho, tipo MIME ou ID de proprietário. Não defina manualmente o Content-Type: o cliente gera o boundary multipart.

Limite: um arquivo de até 10 MB, aplicado durante o recebimento. O serviço detecta o formato pelos bytes e calcula o tamanho real. A detecção por assinatura não substitui validação integral do documento ou antivírus; arquivos não são executados nem publicados como conteúdo web.

Bytes são gravados em `COMPROVANTES_DIR` (padrão `.private/comprovantes`), com nome UUID e sem express.static. O banco guarda metadados; respostas omitem a chave. Se a gravação no banco falhar, o serviço tenta remover o arquivo. Falha de processo entre disco e banco pode deixar órfãos: produção exige reconciliação, volume persistente privado ou adaptação para storage de objetos, backups e permissões do sistema operacional. Não há endpoint de download nesta etapa.

GET `/me/comprovantes?pagina=1&limite=20` retorna `{ dados, meta }`, limitado ao estudante autenticado. Upload tem limite local de tentativas; não substitui quotas de armazenamento ou limitador distribuído em produção.

## Verificações

`npm run typecheck`, `npm run prisma:validate`, `npm test`.

Testes HTTP usam banco e storage simulados. Um teste separado grava/remove um arquivo em diretório temporário isolado. Transações de cadastro/análise ainda precisam de ensaio de concorrência em PostgreSQL real. Nenhuma migração é necessária para esta alteração, e nenhum dado do Neon foi modificado.
