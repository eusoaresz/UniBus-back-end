# Cadastro de veículos

Base `/api/v1/veiculos`. Todas as rotas exigem autenticação e operador ativo. As mutações revalidam o operador dentro da transação.

| Método | Caminho | Finalidade |
| --- | --- | --- |
| POST | `/` | Cadastrar veículo ativo |
| GET | `/` | Listar com paginação e filtros |
| GET | `/:id` | Consultar veículo |
| PATCH | `/:id` | Corrigir dados com motivo |
| PATCH | `/:id/status` | Ativar ou desativar com motivo |
| GET | `/:id/historico` | Consultar histórico paginado |

## Cadastro e edição

```json
{
  "identificacao": "Ônibus municipal 01",
  "placa": "ABC1D23",
  "tipo": "ONIBUS",
  "capacidade": 40
}
```

Identificação recebe de 2 a 150 caracteres. Tipo aceita ONIBUS ou VAN. Capacidade é um número JSON inteiro positivo, correspondente somente às vagas para estudantes; não inclui o motorista. O limite técnico é o máximo do inteiro de 32 bits do banco, sem impor um limite comercial de vagas.

A placa aceita os padrões ABC1234 e ABC1D23, letras minúsculas e hífen após as três primeiras letras. É armazenada sem hífen e em maiúsculas, com unicidade. A validação é de formato, sem consulta externa. Campos desconhecidos, inclusive ativo no cadastro, são rejeitados. O veículo nasce ativo.

PATCH recebe um ou mais campos do cadastro e motivo de 3 a 1000 caracteres. A correção de placa mantém o mesmo ID e registra os valores antigos e novos. Um veículo físico diferente deve receber outro cadastro: o ID não deve ser reaproveitado para substituir um veículo da frota. A API não consegue identificar essa diferença física por conta própria.

Reduzir a capacidade cadastral não altera as capacidades copiadas para os trechos nem realoca ou cancela estudantes automaticamente. A validação operacional de publicação e início exige revisão da alocação e vagas para todos os confirmados, incluindo o extra. Correções e consulta do histórico não movimentam a carteira.

## Situação e vínculos

```json
{
  "ativo": false,
  "motivo": "Veículo encaminhado para manutenção"
}
```

A rota de status exige booleano e motivo, inclusive para reativação. Desativar é impedido quando o veículo normal ou extra está vinculado a trecho ABERTO, FECHADO ou EM_ANDAMENTO. É necessário substituí-lo ou encerrar/cancelar os trechos antes. Rascunhos e trechos concluídos/cancelados não impedem a desativação. Rascunhos precisarão de recursos ativos ao publicar.

Não há DELETE. Desativação preserva os vínculos, embarques e histórico. Convocações ainda não aceitas revalidam a disponibilidade dos recursos ao alocar, conforme o fluxo de operação existente.

## Listagem e histórico

Listagem aceita pagina (padrão 1), limite (padrão 20, máximo 100), identificacao (busca parcial), placa (exata, normalizada), tipo e ativo (`true` ou `false`). Sem filtro de situação, retorna ativos e inativos. Listagem e histórico retornam dados e meta com pagina, limite e temProxima. O histórico ordena registros mais recentes primeiro e mostra autor (ID e nome), motivo, data e estados anterior/novo.

Cadastro, edição e alteração de status gravam AlteracaoVeiculo na mesma transação do veículo. Se a alteração ou a auditoria falhar, nenhuma das duas é persistida. Não existem rotas de alteração ou exclusão dos registros de auditoria.

Erros: 400 para dados inválidos ou motivo ausente; 401 sem autenticação; 403 para conta/perfil sem permissão; 404 para veículo inexistente; 409 para placa já utilizada, conflito de concorrência ou vínculos que impedem desativação.

## Migração e validação

A migração `20261101000100_historico_veiculos` cria a tabela de histórico, relações e índices. Não modifica veículos existentes nem inventa histórico anterior. Precisa ser aplicada antes de usar as novas mutações, após revisão conjunta no banco compartilhado. Sua criação não aplica alterações ao Neon.

Os testes usam banco isolado PGlite com migrações reais. Cobrem permissões, validação, unicidade, rollback, auditoria, desativação com vínculos normais/extra, preservação das capacidades dos trechos e exigência de revisão após redução. O ensaio de concorrência com múltiplas conexões em PostgreSQL continua pendente antes do uso real.
