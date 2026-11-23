# Avisos

Todas as rotas exigem conta ativa e `Authorization: Bearer <token>`.

| Método | Rota | Comportamento |
|---|---|---|
| GET | `/api/v1/avisos` | Avisos ativos, publicados, não expirados, gerais ou do perfil atual |
| GET | `/api/v1/avisos/:id` | Mesmas restrições; 404 se indisponível ou fora do público |
| GET | `/api/v1/avisos/gestao` | Operador: inclui todos os públicos, arquivados e expirados |
| GET | `/api/v1/avisos/gestao/:id` | Operador: consulta administrativa individual |
| POST | `/api/v1/avisos` | Operador: publicar |
| PATCH | `/api/v1/avisos/:id` | Operador: edição parcial |
| PATCH | `/api/v1/avisos/:id/status` | Operador: arquivar/reativar com `{ "ativo": false, "motivo": "Arquivamento" }` ou `true` |

Edição utiliza PATCH, substituindo o PUT anterior. O endpoint comum também respeita o público para operadores; use gestão para administrar outros públicos.

Filtros de ambas as listagens: `pagina`, `limite` (máximo 100), `categoria=GERAL|VIAGENS`, `importante=true|false`. Retorno: `{ dados, meta: { pagina, limite, temProxima } }`.

Exemplo de criação:

```json
{
  "titulo": "Mudança no horário de saída",
  "mensagem": "Confira o novo horário da viagem no aplicativo.",
  "categoria": "VIAGENS",
  "importante": true,
  "publicoPerfil": "ESTUDANTE"
}
```

`publicoPerfil: null` permite todos os perfis. `expiraEm` aceita data ISO com fuso no futuro, ou null para não expirar. Na edição, omitir um campo preserva seu valor; null remove explicitamente a restrição de público ou a expiração. Corpo vazio e campos desconhecidos são rejeitados. Apenas ID e nome do autor são selecionados, sem documentos ou contatos. Mensagens são texto; o front-end não deve interpretá-las como HTML.

## Banco e testes

A migração `20261028000100_avisos` adiciona categoria, importância e arquivamento, preservando avisos existentes como GERAL, não importantes e ativos. Ela foi criada, mas não aplicada ao banco local por esta alteração.

No ambiente de desenvolvimento, após revisar o SQL e a conexão:

```text
npm run prisma:migrate
npm run prisma:generate
npm run typecheck
npm test
```

Os testes HTTP de avisos usam Prisma simulado. O teste de paridade aplica o histórico de migrações em PGlite isolado e compara colunas, índices e relações com o schema. Não há envio push ou e-mail neste módulo; esses canais exigem implementação própria de notificações.

Edição e alteração de situação exigem motivo de 3 a 1000 caracteres. Criação, edição e arquivamento registram autor e estados em AlteracaoAviso, na mesma transação. Não há endpoint público de edição ou consulta dessa auditoria.
