# Atendimento do motorista

Base `/api/v1/operacao`, com Bearer e conta ativa. O cadastro administrativo está em [motoristas](motoristas.md).

## Responsabilidades

O motorista consulta seus atendimentos, passageiros e paradas, registra embarques e responde a convocações de van. **As ações manuais de início e conclusão são exclusivas do operador.** A execução automática integrada à `dev` também inicia na saída prevista e conclui uma hora após a chegada prevista, pelo processamento periódico de 30 segundos. O motorista não publica/cancela viagens, altera rotas, confirma passageiros ou movimenta carteiras.

## Meus atendimentos

`GET /trechos/me` mantém a resposta em array e aceita filtros combinados antes da paginação:

| Parâmetro | Formato |
| --- | --- |
| `pagina` | Inteiro a partir de 1; padrão 1 |
| `limite` | De 1 a 100; padrão 20 |
| `data` | `AAAA-MM-DD`: dia local da saída do trecho em Pedro Osório (UTC-3) |
| `turno` | `MANHA`, `TARDE`, `NOITE` |
| `rotaId` | UUID |
| `sentido` | `IDA`, `VOLTA` |

Sem filtros inclui histórico, ordenado por saída e ID. Nunca inclui rascunhos ou atendimentos de outro motorista. Uma página cheia pode ter continuação; consultar a próxima até retornar menos itens que o limite. A volta após meia-noite aparece no dia seguinte.

Preserva os campos anteriores e acrescenta `viagem.rotaId`, `iniciadoEm`, `concluidoEm`, `alocacao` (`VEICULO` ou `EXTRA`) e `veiculo` com ID, identificação, placa, tipo e capacidade cadastral do veículo correspondente. A capacidade cadastral não substitui a capacidade copiada para o trecho na alocação. Operador e estudante recebem 403 nessa rota própria.

## Resumo por parada

`GET /trechos/:id/resumo`: motorista atualmente atribuído ou operador. O motorista recebe apenas sua alocação; o operador recebe ambas, com `alocacao: null`.

Campos do objeto:

- `trechoId`, `sentido`, `status`, `saidaPrevistaEm`, `chegadaPrevistaEm`;
- `viagem`: `id`, `rotaId`, `nomeRota`, `turno`;
- `alocacao`: `VEICULO`, `EXTRA` ou `null`;
- `geradoEm`: instante da consulta; `confirmacoesEncerradas`: prazo ultrapassado, inscrições suspensas ou trecho fora de ABERTO;
- `totais`: `confirmados`, `embarcados`, `semEmbarque`;
- `paradas`: ID, ordem, nome, cidade, endereço, referência e as contagens abaixo.

| Campo da parada | Significado |
| --- | --- |
| `embarquesPrevistos` | Confirmados com origem nessa parada |
| `desembarquesPrevistos` | Confirmados com destino nessa parada |
| `embarcadosNaOrigem` | Pessoas com embarque REGISTRADO cuja origem é a parada |
| `semEmbarqueNaOrigem` | Confirmados da origem sem registro de embarque |
| `semMovimentacao` | Nenhum embarque nem desembarque previsto nessa alocação |
| `extremidade` | Primeira ou última parada ativa do trecho |
| `podeDispensar` | Parada intermediária sem movimentação, com confirmações encerradas e trecho ABERTO, FECHADO ou EM_ANDAMENTO |

Retorna todas as paradas ativas na ordem publicada do trecho, inclusive as com contagem zero. Não utiliza a ordem atual do catálogo nem versões inativas. Totais abrangem todas as confirmações, sem paginação. Esperas, cancelamentos e expirações não entram. Repetições de embarque não aumentam o total.

Uma parada pode estar sem movimento para o ônibus e ter passageiros para a van. O motorista pode dispensar a parada intermediária quando `podeDispensar` for verdadeiro. Origem e destino permanecem obrigatórios. Consultar novamente antes de decidir: confirmações tardias do operador podem mudar essa indicação. O campo não registra uma dispensa executada, não remove a parada e não determina desvios de trânsito. Desembarque é previsto, não um registro de desembarque real. Após a conclusão, `semEmbarque` não deve ser apresentado como pessoas ainda aguardando transporte.

O resumo é recalculado a cada consulta, com os dados persistidos. Atualizar ao abrir ou retomar o atendimento, depois de registrar embarque e periodicamente enquanto a tela estiver ativa, para refletir transições automáticas; oferecer atualização manual. Não inferir o status apenas pelo relógio: a execução automática depende de operador ativo e validações operacionais. Não há envio programado por WhatsApp/push nesta entrega. O resumo não contém nomes, CPF, telefone ou saldo; a lista nominal usa a rota própria.

A dispensa usa o prazo persistido do trecho, inclusive o corte de duas horas antes da saída na volta noturna; nos demais casos, o corte é de uma hora. No instante exato do limite as confirmações ainda são permitidas. Trechos concluídos ou cancelados nunca permitem dispensa.

## Passageiros, embarque e convocações

| Método | Rota | Uso |
| --- | --- | --- |
| GET | `/trechos/:id/passageiros` | Array paginado de confirmados da alocação, nome/matrícula, origem/destino e embarques |
| POST | `/trechos/:id/embarques` | `{ "participacaoId": "uuid" }` ou `{ "qr": "conteudo-assinado" }`, nunca ambos |
| GET | `/convocacoes/minhas` | Convocações próprias; `pagina` e `limite` |
| POST | `/convocacoes/:id/responder` | `{ "aceitar": true }` ou `{ "aceitar": false }` |

Relacionar origem/destino da lista nominal às paradas do resumo. O embarque exige trecho EM_ANDAMENTO e motorista atribuído à alocação do passageiro. A repetição não gera nova presença nem cobrança. Enviar o conteúdo completo do QR para validar assinatura/ciclo; a câmera pertence ao frontend.

Enquanto o trecho não estiver EM_ANDAMENTO, orientar o motorista a aguardar o início automático ou a intervenção do operador. Não oferecer início/conclusão no seu painel: essas ações retornam 403. Após a conclusão automática, atualizar a tela e encerrar a oferta de embarque. Aceitar convocação revalida prazo e recursos, mas não confirma alunos após o corte; essa decisão permanece com o operador.

Na conclusão automática, não são apuradas faltas quando não existe nenhum embarque registrado no trecho. Havendo algum embarque, a rotina apura faltas dos confirmados sem registro. Por isso, `semEmbarque` é uma contagem de registros ausentes e não equivale a faltas aplicadas. A conclusão manual do operador mantém a apuração de faltas.

## Erros e integração

401 exige novo login. 403 indica perfil, conta ou atribuição sem permissão. 404 indica trecho ausente ou rascunho para solicitante autorizado. 400 indica parâmetros inválidos; 409, conflito operacional. Recarregar dados após ações e conflitos. A substituição do motorista revoga seu acesso ao resumo e aos passageiros daquele atendimento.

Sem migração ou mudança financeira. Validar as telas com motorista principal, reforço, motorista não atribuído, operador e estudante. Testar resumo vazio, ida/volta, espera, cancelamentos, embarques repetidos e substituição do motorista.

## Validação desta entrega

Alinhamento em 18/11/2026 com a `dev` em `ae4a835` (PR #22): checagem de tipos aprovada. A suíte completa executou 252 testes, com 250 aprovados e duas falhas de execução (ECONNRESET em troca de rota e processo Prisma sem conclusão no teste de migração). A repetição sequencial dos arquivos de operação e migração aprovou todos os 60 testes, sem alteração de código entre as execuções. O cenário automático também verifica o resumo e a listagem do motorista, a dispensa durante o atendimento, sua desativação após conclusão e a rejeição de embarques em trecho concluído.

Em 16/11/2026, `npm run typecheck` passou e a execução completa de `npm test` terminou com 250 testes aprovados. Os seis cenários novos cobrem filtros/atribuição/veículo, resumo por alocação e embarques repetidos, permissões/substituição, fluxo HTTP da van, dispensa de paradas após o corte e paradas ativas da volta sem passageiros. Os testes usam banco isolado e não validam as telas ou o deploy real.
