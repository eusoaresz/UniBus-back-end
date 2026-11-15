# Escalas semanais do operador

Base `/api/v1/escalas`. Todas as rotas exigem `verificarToken` e `exigirOperador`, com conta ativa. Nenhum schema ou migração foi alterado.

| Método | Caminho | Uso |
|---|---|---|
| GET | `/` | Lista `{ dados, meta }`, `pagina`/`limite` (máximo 100) |
| GET | `/:id` | Consulta com resumo da rota, motorista e veículo |
| POST | `/` | Cadastra planejamento semanal |
| PATCH | `/:id` | Atualização parcial, inclusive `ativa: false` |

Corpo de exemplo:

```json
{
  "diaSemana": "SEGUNDA",
  "turno": "NOITE",
  "rotaId": "00000000-0000-4000-8000-000000000001",
  "motoristaId": "00000000-0000-4000-8000-000000000002",
  "veiculoId": "00000000-0000-4000-8000-000000000003",
  "saidaIdaMinuto": 1020,
  "saidaVoltaMinuto": 1380,
  "chegadaPedroMinuto": 30,
  "saidaVoltaDiaOffset": 0,
  "chegadaPedroDiaOffset": 1
}
```

Dias: SEGUNDA a SEXTA; turnos: MANHA, TARDE e NOITE. Horários são minutos desde meia-noite (0–1439); offsets indicam mesmo dia (0) ou dia seguinte (1). Horários opcionais podem ser removidos com `null`. A sequência, quando informada, exige ida antes da volta e chegada a Pedro Osório depois da volta.

Escala ativa exige rota e veículo ativos e conta de motorista ativa com perfil MOTORISTA. Vínculos inexistentes retornam 404. A unicidade existente de `(diaSemana, turno, rotaId)` é preservada e retorna 409. O PATCH não reaplica defaults a campos omitidos. Não há exclusão física; desative para preservar referências.

## Geração automática

O servidor executa a geração ao iniciar e a cada seis horas. Escalas ativas com os três horários preenchidos podem gerar e publicar viagens para os próximos 30 dias, incluindo o dia atual quando a saída ainda não passou. O backend estima a duração da ida em 60 minutos. A saída precisa estar em um semestre letivo; a publicação revalida CNH, recursos, capacidade e conflitos. Sem operador ativo não há geração.

Uma combinação de data/turno/rota já existente não é recriada, inclusive se estiver cancelada ou em rascunho. Alterar ou desativar a escala não modifica as viagens já geradas. Para feriados, cancele a viagem correspondente. Salvar uma escala não executa imediatamente a rotina e não garante publicação: erros de uma escala são registrados no servidor sem impedir as demais. O painel deve conferir o resultado em `/api/v1/viagens`.

Na criação, `ativa` tem padrão `true`; envie explicitamente `false` para preparar uma escala sem habilitar geração. A geração e as regras de publicação não foram alteradas pelo alinhamento de 15/11/2026; esta seção corrige a descrição anterior.

Testes: `npm exec -- tsx --test tests/escalas.test.ts`, com HTTP local e Prisma simulado. A suíte valida autorização, UUID, vínculos, horários, defaults apenas na criação, PATCH parcial, paginação e conflitos sem dados internos. Os testes não acessam PostgreSQL remoto.
