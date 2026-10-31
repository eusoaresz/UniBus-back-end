# Melhorias na gestão de avisos

## 1. Registrar quem editou ou arquivou o aviso

Hoje existe `publicadoPorId`, mas ele identifica somente quem criou. Outro operador pode editar ou arquivar, e fica apenas a data de atualização.

Recomendo registrar responsável, ação, horário e valores anteriores/novos em um histórico administrativo. Isso permite identificar, por exemplo, quem alterou um comunicado sobre cancelamento.

Referência: [`avisos.service.ts`](../src/modules/avisos/avisos.service.ts#L86).

## 2. Adicionar filtros específicos à gestão

A gestão inclui arquivados e expirados, mas não permite filtrá-los diretamente. Conforme o volume crescer, o operador precisará procurar entre todos os registros.

Sugiro filtros administrativos para:

- Ativo ou arquivado.
- Expirado ou vigente.
- Público destinatário.
- Período de publicação.

Esses filtros devem ficar em um schema próprio da gestão, preservando as restrições da consulta comum.

## 3. Complementar os testes com persistência real e múltiplos registros

Os testes atuais verificam bem permissões e regras básicas, mas simulam o Prisma. Também usam predominantemente um único aviso.

Faltam verificações mais representativas de:

- Ordenação entre importantes e comuns.
- Paginação com mais registros que o limite.
- `temProxima` verdadeiro e falso.
- Filtros combinados.
- Persistência e seleção dos campos em PostgreSQL.
- Reativação de aviso que continua expirado.

Referência: [`avisos.test.ts`](../tests/avisos.test.ts).