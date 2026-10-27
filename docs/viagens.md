# Viagens: rascunhos

Esta etapa implementa criação, listagem, consulta e edição de rascunhos. Publicação, alocação de veículos, inscrições, fila, cobrança, embarque e disciplina ainda não estão disponíveis pela API. A modelagem prepara esses próximos fluxos.

## Rotas

Todas exigem `Authorization: Bearer <token>` de operador com conta ativa. O perfil e o status atuais são consultados no banco.

| Método | Caminho | Resultado |
| --- | --- | --- |
| POST | `/api/v1/viagens` | Cria viagem com os dois trechos; retorna 201 |
| GET | `/api/v1/viagens` | Lista viagens com paginação |
| GET | `/api/v1/viagens/:id` | Consulta uma viagem |
| PUT | `/api/v1/viagens/:id` | Substitui os dados editáveis do rascunho; exige motivo |

Exemplo de criação, substituindo rotaId por uma rota cadastrada:

```json
{
  "data": "2026-11-02",
  "turno": "NOITE",
  "rotaId": "00000000-0000-4000-8000-000000000001",
  "trechos": [
    {
      "sentido": "IDA",
      "saidaPrevistaEm": "2026-11-02T18:00:00-03:00",
      "chegadaPrevistaEm": "2026-11-02T19:00:00-03:00"
    },
    {
      "sentido": "VOLTA",
      "saidaPrevistaEm": "2026-11-02T22:00:00-03:00",
      "chegadaPrevistaEm": "2026-11-02T23:00:00-03:00"
    }
  ]
}
```

Na edição, enviar o mesmo corpo completo, acrescentando `motivo`, texto entre 3 e 500 caracteres. A alteração registra operador, motivo e dados anteriores/novos dos dois trechos. Os IDs dos trechos são preservados; as paradas do rascunho são recriadas a partir da rota. Não é permitido editar por esta rota uma viagem publicada, um trecho fora de RASCUNHO ou qualquer rascunho com participações existentes.

## Validações e respostas

- Data corresponde ao dia da saída da ida em `America/Sao_Paulo`. Horários precisam de fuso explícito. Retorno no dia seguinte é permitido.
- São obrigatórios exatamente IDA e VOLTA; chegada posterior à saída e retorno sem sobreposição com a ida. O intervalo de 120 minutos entre viagens diferentes será validado na futura alocação/publicação.
- A rota deve estar ativa, ter pelo menos três pontos ativos e começar por Prefeitura e Praça, ambas em Pedro Osório. Esses nomes aceitam variação de caixa e acentos. A sequência inversa é copiada para a volta.
- Rotas e pontos precisam ser provisionados previamente. Ainda não há endpoints para cadastrá-los nesta entrega.
- O servidor define status RASCUNHO, tarifa de 2.00, prazos de uma hora antes de cada saída, nome da rota e responsável pela criação. Não aceita esses campos no corpo da requisição. Motorista e veículo serão definidos em etapa posterior.
- Uma mesma data, turno e rota não pode gerar duas viagens.
- A tarifa é devolvida como texto com duas casas (`"2.00"`). A data da viagem é `YYYY-MM-DD`; os horários são instantes ISO em UTC.
- Dados inválidos retornam 400; falta de autenticação, 401; perfil ou conta sem acesso, 403; viagem ou rota inexistente, 404; conflito de cadastro ou estado, 409.

A listagem aceita `pagina` (padrão 1), `limite` (padrão 20, máximo 100), `data`, `turno`, `rotaId` e `status`. Retorna `{ dados, meta: { pagina, limite, temProxima } }`, em ordem decrescente de data e ID. Campos desconhecidos são rejeitados.

Criação e edição usam transação Serializable, com até três tentativas em conflitos de concorrência. Isso não substitui os testes futuros de concorrência dos fluxos financeiros e de vagas.

## Migração

`20261027000100_viagens_rascunhos` transforma o schema antigo preservando valores monetários com divisão por 100, registros financeiros antigos e histórico das alocações removidas. Registros gerados pela migração têm autor nulo; não são atribuídos artificialmente a um operador. O histórico original mantém seu autor.

O SQL executa em transação e bloqueia as tabelas afetadas durante a operação. Não aplicar com a aplicação atendendo operações. Ensaiar primeiro numa cópia do banco, revisar o backup e combinar a janela com o colega antes de aplicar ao Neon compartilhado. Não usar `db push` como substituto dessa migração.

Em banco sem viagens, não há preparação de horários. Se existirem trechos, a chegada da volta pode ser recuperada de `Viagem.chegadaPedroPrevistaEm`. Horários faltantes, especialmente a chegada da ida que não existia no schema anterior, exigem informação revisada do operador. Não são estimados pela migração.

Antes da migração, a preparação manual desses dados usa a tabela auxiliar abaixo. Cada linha deve conter o ID real do trecho e horários confirmados; `saidaPrevistaEm` só preenche uma saída antiga nula. A tabela é removida ao concluir a migração com sucesso.

```sql
CREATE TABLE "_ViagemHorariosMigracao" (
  "trechoId" UUID PRIMARY KEY,
  "saidaPrevistaEm" TIMESTAMPTZ(3),
  "chegadaPrevistaEm" TIMESTAMPTZ(3) NOT NULL
);
```

A migração interrompe se houver horário ausente/inválido, viagem sem dois trechos, sobreposição ida/volta, múltiplas alocações ativas do mesmo tipo ou participação confirmada em alocação incompatível. Esses dados devem ser corrigidos com revisão prévia; não apagar registros para contornar a validação. Se o Prisma registrar uma tentativa como falha, confirmar o rollback e corrigir a causa antes de usar o procedimento de resolução de migrações falhas e tentar novamente.

O histórico da migração preserva as alocações canceladas, vínculos antigos e dados anteriores. As alocações não canceladas são transferidas para os campos normais/extras. Não há nova cobrança nem recarga automática nessa operação.

## Verificação

- `npm run prisma:validate` e `npm run prisma:generate`: validação estrutural e geração do cliente.
- `npm run typecheck`: validação de tipos.
- `npm test`: regressões gerais, API de viagens com persistência simulada e migração SQL em PostgreSQL isolado em memória via PGlite.
- A migração é testada em banco vazio, com dados financeiros e históricos, com horários ausentes e com alocações duplicadas. O teste compara colunas, índices e chaves estrangeiras com o SQL gerado a partir do schema atual.

Os testes da API não acessam o Neon e não demonstram concorrência real do serviço. A aplicação da migração no ambiente compartilhado e um teste integrado da API nesse banco continuam pendentes.
