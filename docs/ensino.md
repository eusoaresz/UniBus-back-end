# Instituições, unidades e pontos de parada

Os cadastros são administrados exclusivamente por operador ativo, com autenticação. As mutações revalidam o operador dentro da transação. Não há exclusão física pela API.

Bases:

- `/api/v1/instituicoes`
- `/api/v1/unidades-ensino`
- `/api/v1/pontos-parada`

Em cada base estão disponíveis POST `/`, GET `/`, GET `/:id`, PATCH `/:id`, PATCH `/:id/status` e GET `/:id/historico`.

## Cadastro

Instituição recebe nome e tipo (FACULDADE, TECNICA ou PREPARATORIA, conforme o modelo existente).

Ponto recebe nome, cidade, endereco opcional e referencia opcional. A cidade permanece texto neste cadastro; o catálogo de cidades é administrado separadamente, sem sincronização automática com este campo.

Unidade recebe nome, endereco opcional, instituicaoEnsinoId e pontoParadaId. Instituição e ponto precisam estar ativos. O ponto é exclusivo por unidade, inclusive quando a unidade está inativa. Nomes de unidades são únicos dentro da mesma instituição, conforme a restrição existente no banco.

Os registros nascem ativos. Não se recebe situação ou ID no cadastro. Nomes e cidade têm de 2 a 150 caracteres; endereço e referência, quando informados, têm de 2 a 300. Campos opcionais podem ser removidos com null na edição.

A sequência de cadastro é: instituição e ponto, depois unidade. Não é necessário cadastrar estudantes para criar esses registros.

## Edição e histórico

PATCH exige ao menos um campo editável e motivo de 3 a 1000 caracteres. Instituição permite nome/tipo; ponto permite nome/cidade/endereco/referencia; unidade permite nome/endereco/pontoParadaId. A instituição à qual a unidade pertence não é transferida por esta rota. Uma transferência de estudante é feita pelo fluxo de correção cadastral, com motivo e auditoria.

Alterar nome ou endereço de um ponto não modifica as cópias de paradas já salvas em viagens. Trocar o ponto da unidade também não realoca estudantes nas viagens existentes. A mudança de uma viagem publicada utiliza o fluxo operacional de troca de rota e resolução dos passageiros.

Cadastro, edição e situação geram histórico em AlteracaoEnsino com autor, data, motivo e estados anterior/novo. Cada registro se refere a exatamente uma instituição, unidade ou ponto, com chave estrangeira preservada. Falha na alteração ou na auditoria desfaz a transação inteira. Não existem rotas de edição ou exclusão do histórico.

## Ativação e desativação

As três rotas `/:id/status` recebem o mesmo corpo:

```json
{
  "ativo": false,
  "motivo": "Encerramento do atendimento desta unidade"
}
```

Instituições e unidades continuam usando o campo `ativa` nas respostas; pontos usam `ativo`. O campo do comando de status e o filtro da listagem são `ativo` para todos.

Desativar instituição ou unidade exige resolver os vínculos de todos os estudantes APROVADO ou SUSPENSO, independentemente do estado da conta. Para instituição, a verificação considera todas as suas unidades. A ação não transfere, suspende, rejeita ou encerra automaticamente cadastros, não apaga histórico e não movimenta saldo.

O encerramento administrativo de estudante está disponível em /api/v1/estudantes/:id/encerrar, conforme encerramento-estudantes.md. A transferência para outra unidade ativa pode ser realizada pela correção administrativa existente em `/api/v1/usuarios/:id/dados`. Encerramento exige resolver recargas pendentes e participações em andamento; não apaga o vínculo histórico com a unidade.

Desativar instituição não muda em cascata o campo ativa das unidades. Mesmo que uma unidade mantenha esse campo, instituição inativa impede novos cadastros e vínculos que exijam instituição disponível. Reativar unidade exige instituição e ponto ativos; não reativa dependências automaticamente.

Desativar ponto exige resolver, antes:

- A unidade ativa vinculada.
- Sua presença em qualquer rota ativa.
- Seu uso na versão ativa das paradas de trechos ABERTO, FECHADO ou EM_ANDAMENTO.

Paradas de versões antigas, rascunhos e trechos concluídos/cancelados não bloqueiam a desativação. Histórico e referências são preservados. A gestão do catálogo de rotas está disponível em /api/v1/rotas; este cadastro não remove pontos das rotas automaticamente.

## Consultas

Listas recebem pagina (padrão 1), limite (padrão 20, máximo 100), nome (busca parcial) e ativo (`true` ou `false`). Sem filtro de situação, incluem ativos e inativos. Histórico recebe apenas pagina/limite, ordena do mais recente para o mais antigo e retorna ID/nome do autor, sem credenciais ou dados dos estudantes. Respostas paginadas contêm dados e meta com pagina, limite e temProxima.

Erros: 400 para dados inválidos/campos desconhecidos/motivo ausente, 401 sem autenticação, 403 sem permissão, 404 para cadastro não encontrado e 409 para vínculos impeditivos, exclusividade/nomes de unidade em conflito ou alterações concorrentes.

## Migração e validação

`20261101000200_historico_ensino` cria apenas a estrutura de auditoria e suas restrições. Preserva os cadastros existentes e não inventa histórico anterior. Deve ser revisada e aplicada no banco correto antes de usar as mutações; não foi aplicada ao Neon nesta etapa.

Os testes usam PGlite isolado e migrações reais. Validam permissões, vínculos ativos, exclusividade de ponto, desativação, transferência sem alteração de saldo, preservação das paradas das viagens e rollback em falha da auditoria. O ensaio com múltiplas conexões em PostgreSQL permanece uma validação separada antes do uso real.

Correções em pontos usados por rascunhos sinalizam revisaoRotaPendente. O operador deve revisar e salvar esses rascunhos antes de publicar, conforme catalogos.md.
