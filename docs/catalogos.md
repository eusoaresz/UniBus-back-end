# Rotas e cidades

Bases `/api/v1/rotas` e `/api/v1/cidades`, restritas a operador ativo. Ambas oferecem POST `/`, GET `/`, GET `/:id`, PATCH `/:id`, PATCH `/:id/status` e GET `/:id/historico`. Não há DELETE.

## Rotas

```json
{
  "nome": "Centro",
  "descricao": "Atendimento das instituições da região central",
  "pontoIds": ["UUID_PREFEITURA", "UUID_PRACA", "UUID_INSTITUICAO"]
}
```

O array pontoIds define a ordem da ida. Exige de 3 a 100 pontos distintos, existentes e ativos. Os dois primeiros devem ser Prefeitura e Praça, em Pedro Osório, nesta ordem. A validação desses nomes ignora acentos e diferenças entre maiúsculas e minúsculas. A volta é invertida ao criar ou revisar a viagem; não existe outra lista de pontos para a volta no catálogo.

Nome tem de 2 a 150 caracteres e é único conforme a restrição existente no banco. Descrição é opcional, aceita null e, quando preenchida, tem de 2 a 1000 caracteres. O cadastro nasce ativo. PATCH recebe nome, descricao e/ou pontoIds, com motivo obrigatório de 3 a 1000 caracteres. Não permite alterar ativo diretamente; use a rota de status.

Consultar uma rota retorna suas paradas ordenadas e os dados dos pontos. Listagem retorna os dados básicos, sem carregar todas as paradas. Mudanças na ordem são atômicas: conflito de nome ou outra falha não deixa uma lista parcial.

## Viagens e revisão de rascunhos

Alterar os pontos ou o nome da rota não reescreve as viagens existentes. Viagens publicadas preservam nome, paradas, passageiros e cobranças. A alteração específica de uma viagem publicada continua usando o fluxo operacional de troca de rota e resolução de participações.

Rascunhos vinculados recebem revisaoRotaPendente=true quando a lista/ordem dos pontos ou o nome da rota muda. Correções cadastrais em pontos usados pelos rascunhos também ativam essa indicação. Alterar apenas a descrição da rota não exige revisão.

O campo aparece nas consultas de viagens e não pode ser definido pelo cliente. Publicação retorna 409 enquanto a revisão estiver pendente. Para resolver, o operador consulta o rascunho e salva seu conteúdo completo em PUT `/api/v1/viagens/:id`, com motivo, rota e horários. Esse fluxo recompõe as paradas dos dois trechos a partir do catálogo atual e limpa a indicação dentro da mesma transação. Não há atualização silenciosa das paradas.

POST `/api/v1/operacao/viagens/:id/publicar` mantém suas validações de recursos, capacidade, semestre, horários e rota ativa. Revisar o rascunho não dispensa essas validações.

## Desativação

PATCH `/:id/status` recebe `{ "ativo": false, "motivo": "Retirada do catálogo" }`. Reativação usa true e também exige motivo.

Rota inativa não pode ser selecionada em novas viagens ou preferências, nem publicada em rascunhos. As viagens já publicadas continuam operáveis, sem cancelamentos ou estornos automáticos. Preferências existentes permanecem vinculadas; opções disponíveis para novas seleções mostram apenas rotas ativas. Reativar rota revalida a ordem inicial, quantidade e atividade dos pontos.

## Cidades

POST recebe nome; PATCH recebe nome e motivo. Nome tem de 2 a 150 caracteres e é único conforme a restrição existente. Cadastro nasce ativo. Desativar impede novas seleções em cadastros e preferências, mas preserva cidade de origem, preferências já salvas, situação do estudante e saldo.

O catálogo de cidades não substitui o campo cidade em texto dos pontos de parada. Renomear uma cidade não reescreve pontos nem cópias de paradas nas viagens. Essa unificação não faz parte desta etapa.

## Listagem, histórico e erros

Listagem aceita pagina (padrão 1), limite (padrão 20, máximo 100), nome (busca parcial) e ativo (`true` ou `false`). Sem filtro de situação, inclui ativos e inativos. Histórico aceita pagina/limite. Ambos retornam dados e meta com pagina, limite e temProxima.

AlteracaoCatalogo registra autor, data, motivo e estados anterior/novo, com vínculo a exatamente uma rota ou cidade. Histórico retorna apenas ID/nome do autor, sem dados dos estudantes. Auditoria, atualização de pontos e marcação dos rascunhos participam da mesma transação.

Erros: 400 para formato/campos inválidos ou motivo ausente; 401 sem autenticação; 403 sem permissão; 404 para cadastro inexistente; 409 para duplicidade, pontos indisponíveis/ordem inicial incorreta, revisão pendente ou conflito concorrente.

## Migração

`20261101000300_catalogos_rotas_cidades` adiciona o histórico e o campo revisaoRotaPendente, inicialmente false. Não altera as listas de pontos nem os vínculos existentes. A migração precisa de revisão conjunta antes de aplicação no banco compartilhado. Os testes usam PGlite isolado; ensaios de concorrência com múltiplas conexões em PostgreSQL continuam pendentes.
