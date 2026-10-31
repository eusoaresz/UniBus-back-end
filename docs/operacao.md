# Operação de viagens, fila, van e disciplina

## Entrega

O módulo `src/modules/operacao` complementa o CRUD de rascunhos existente. Não substitui a carteira: confirmação usa `debitar` e cancelamento usa `estornar` dentro da mesma transação da participação. Dinheiro usa Prisma.Decimal; uma repetição não cria outra cobrança ou outro estorno. O embarque não movimenta saldo.

Há uma migração nova: `20261031000100_operacao`. Adiciona semestre, falta, advertência, convocação de van, marcador de confirmação tardia e bloqueio disciplinar com data final. Preserva os registros anteriores e não inventa semestres ou faltas históricas. Nenhuma migração desta entrega foi aplicada ao Neon.

Antes de aplicar no banco compartilhado, ambos os desenvolvedores devem revisar e ensaiar a migração em uma cópia. O servidor atualizado depende desses campos: não apontar a nova versão para um banco sem a migração. Os testes aplicam o histórico em PGlite isolado.

## Preparação

1. Recursos devem existir: motorista com usuário MOTORISTA ativo, CNH D/E válida na viagem e veículo ativo com capacidade positiva.
2. Cadastrar um semestre letivo sem sobreposição, abrangendo as saídas. `inicio` é inclusivo e `fim` exclusivo. Usar instantes ISO com fuso; para incluir o último dia inteiro, o fim é o início do dia seguinte.
3. Criar rascunho com ida e volta em `/api/v1/viagens`, usando o contrato já documentado em `viagens.md`.
4. Alocar recursos de cada trecho. Publicar a viagem completa.

O intervalo entre recursos em viagens diferentes é de 120 minutos, considerando o fim previsto e a próxima saída. Ida e volta da mesma viagem exigem apenas ausência de sobreposição. Capacidade é copiada para o trecho. Substituição não pode deixar confirmados sem vaga; realocação mantém ordem da fila e histórico.

## Contrato HTTP

Todas as rotas abaixo usam `/api/v1/operacao`, Bearer token e conta ativa. Objetos financeiros são serializados em texto com duas casas. BigInt da fila é serializado como texto. Listagens operacionais aceitam `pagina` e `limite` (padrão 20, máximo 100) e retornam arrays limitados; respostas de participação contêm status e alocação, sem CPF, senha ou contatos de outros alunos.

### Consultas e estudante

| Método | Rota | Uso |
|---|---|---|
| GET | `/trechos` | Trechos publicados e histórico, sem rascunhos |
| GET | `/trechos/:id` | Detalhes, paradas, ocupação, recursos e participação própria |
| GET | `/participacoes/minhas` | Participações do estudante autenticado |
| POST | `/trechos/:id/inscricoes` | `{ "origemId": "uuid", "destinoId": "uuid" }` |
| POST | `/inscricoes/ida-volta` | `{ "trechos": [{ "trechoId": "uuid", "origemId": "uuid", "destinoId": "uuid" }, { "trechoId": "uuid", "origemId": "uuid", "destinoId": "uuid" }] }` |
| POST | `/participacoes/:id/cancelar` | Cancelamento próprio; sem corpo |
| GET | `/participacoes/:id/qr` | Conteúdo assinado para renderizar como QR no front-end |
| GET | `/faltas/minhas` | Histórico próprio de faltas |
| POST | `/faltas/:id/justificativa` | `{ "justificativa": "Texto para análise" }` |

Origem e destino são IDs de ParadaTrecho, não de PontoParada. Ambos pertencem ao trecho, com origem antes do destino. Uma vaga é ocupada pelo trecho inteiro. Repetição da mesma inscrição ativa não muda a posição nem cobra novamente; inscrição após cancelamento recebe nova posição e novo ciclo quando confirmada.

Antes do corte de uma hora, a fila promove elegíveis em ordem. Cadastro deve estar aprovado, usuário ativo, sem impedimento e saldo final de pelo menos -20.00. Sem saldo, mantém posição e recebe aviso, podendo ser ultrapassado por elegíveis. Espera não cobra. Regularização de saldo é reavaliada pelo job antes do corte. Se uma solicitação conjunta de ida e volta não confirmar ambas, tudo é revertido; o usuário pode solicitar os trechos separadamente para entrar em espera.

Cancelamento ordinário até uma hora antes da saída estorna a confirmação. Desistência de espera é permitida depois do corte, sem efeito financeiro. Após início não há promoção nem cancelamento comum. Ao iniciar ou atingir a saída prevista, esperas restantes expiram sem cobrança.

### Motorista e embarque

| Método | Rota | Uso |
|---|---|---|
| GET | `/trechos/me` | Atendimentos do motorista autenticado |
| GET | `/convocacoes/minhas` | Convocações do motorista |
| POST | `/convocacoes/:id/responder` | `{ "aceitar": true }` ou false |
| GET | `/trechos/:id/passageiros` | Motorista atribuído ou operador |
| POST | `/trechos/:id/embarques` | `{ "participacaoId": "uuid" }` OU `{ "qr": "conteudo-assinado" }` |

Motorista vê passageiros somente da sua alocação. Embarque exige trecho em andamento e participação confirmada. QR contém participação e ciclo, com assinatura, audiência e expiração; cada leitura revalida o banco. Cancelamento, reconfirmação ou bloqueio invalidam a utilização do QR antigo. O front-end renderiza o conteúdo como imagem QR; o servidor não entrega PNG. Repetir embarque retorna o existente, sem nova presença ou débito.

### Operador

| Método | Rota | Corpo/uso |
|---|---|---|
| GET | `/recursos` | Até 100 motoristas e veículos ativos, dados mínimos |
| GET | `/semestres` | Semestres cadastrados |
| POST | `/semestres` | `{ "nome": "2027/1", "inicio": "2027-01-01T00:00:00-03:00", "fim": "2027-07-01T00:00:00-03:00" }` |
| PATCH | `/trechos/:id/recursos` | motoristaId, veiculoId, motoristaExtraId e veiculoExtraId (ambos ou null), motivo |
| POST | `/viagens/:id/publicar` | Publica ida e volta, sem corpo |
| GET | `/trechos/:id/fila` | Esperas em ordem |
| POST | `/trechos/:id/confirmacoes` | `{ "estudanteId": "uuid", "motivo": "Autorização excepcional" }`; exige inscrição em espera |
| PATCH | `/trechos/:id/horario` | saidaPrevistaEm, chegadaPrevistaEm, reabrir (boolean), motivo |
| POST | `/trechos/:id/convocacoes` | motoristaId, veiculoId, prazoMinutos (1 a 20; padrão 20) |
| POST | `/trechos/:id/indisponibilidade` | `{ "motivo": "Sem van disponível no momento" }` |
| POST | `/trechos/:id/cancelar` | motivo; estorna somente este trecho |
| POST | `/viagens/:id/cancelar` | motivo; cancela e estorna ambos, se não iniciados |
| POST | `/trechos/:id/iniciar` | Sem corpo |
| POST | `/trechos/:id/concluir` | Sem corpo; apura faltas |
| POST | `/prazos/processar` | Execução manual do processamento periódico |
| GET | `/estudantes/:id/disciplina` | Faltas e advertências administrativas |
| POST | `/faltas/:id/analisar` | `{ "aprovar": true, "motivo": "Justificativa aceita" }` |
| POST | `/estudantes/:id/disciplina/liberar` | `{ "semestreId": "uuid", "motivo": "Revisão presencial" }`; libera as advertências daquele semestre |

Após o corte, só o operador confirma, com motivo, vaga, saldo e respeito à fila. Todos os elegíveis anteriores são considerados primeiro. Confirmação excepcional tardia concede cancelamento por 30 minutos, limitado à saída prevista e ao início real se ocorrer antes. Mudança de horário não renova essa janela. Adiamento depois do fechamento não reabre confirmação/cancelamento sem `reabrir: true`; o novo corte precisa estar no futuro. A alteração operacional de horário preserva a data local da ida e não aceita sobreposição com o outro trecho.

Interrupção após início retorna conflito para análise manual; não presume estorno universal. Este módulo não permite mudar rota/paradas de viagem publicada; essa alteração exige fluxo próprio para resolver pontos dos passageiros antes de remover paradas utilizadas. A edição de rascunhos permanece disponível.

## Van e processamento automático

O job é iniciado pelo `server.ts` e roda a cada 30 segundos, sem sobreposição dentro do processo. Não inicia transportes automaticamente. Antes do corte, promove fila elegível. Uma hora antes da saída notifica operadores sobre demanda em espera. Operador escolhe o motorista e a van; o candidato recebe uma notificação interna. Prazo padrão de resposta é 20 minutos e nunca ultrapassa a saída; pode ser reduzido pelo operador. Não existe chamada externa de WhatsApp/push nesta entrega.

Aceite valida novamente recursos e capacidade e aloca o extra. Após o corte, o operador ainda precisa confirmar os próximos elegíveis: o aceite do motorista não é uma confirmação acadêmica/financeira. Recusa ou expiração avisa os operadores para avaliar alternativa. Há apenas uma convocação pendente por trecho; o serviço serializa alterações e revalida após conflitos. Sem alternativa, o operador comunica indisponibilidade aos alunos em espera. Na saída eles expiram sem cobrança.

O job não depende da interface aberta. Seu atraso máximo normal é o intervalo de execução; as regras críticas também verificam datas nas ações HTTP. Não há promoção depois da saída mesmo se o job ainda não rodou.

## Disciplina

Conclusão registra uma falta por participação confirmada sem embarque registrado. Ida e volta são faltas separadas. Não gera débito adicional. A contagem usa o semestre da saída cadastrada, sem apagar histórico:

| Faltas contabilizadas | Efeito |
|---|---|
| 3 | Solicitação formal de justificativa |
| 4 | Primeira advertência, sem bloqueio |
| 8 | Segunda advertência: impede novas confirmações; preserva login, carteira e participações existentes |
| 12 | Terceira: bloqueia login e JWTs antigos; cancela/estorna participações futuras não iniciadas; QR deixa de ser utilizável |

Justificativa é texto, sem prazo automático, e aprovação só retira a falta da contagem disciplinar. Não apaga falta nem estorna passagem. Advertências já aplicadas exigem revisão manual e liberação com motivo. Uma justificativa analisada não é sobrescrita pelo estudante. Bloqueado na terceira advertência deve procurar a secretaria; a autenticação não é contornada para enviar justificativa.

Bloqueio disciplinar tem fim no semestre e é separado de Usuario.status. Encerramento do semestre ou liberação não apaga advertências e não remove bloqueios administrativos de outra natureza. Liberação não restaura automaticamente participações canceladas.

## Evidências e limites

Testes de integração usam Prisma e PGlite com migrações reais, incluindo saldo, estorno, fila, QR, van, disciplina, proteção de acesso e rollback conjunto de ida/volta. PGlite serializa transações na conexão; não equivale a teste de carga/concorrência de PostgreSQL remoto com múltiplas conexões. Fazer esse ensaio e revisar migrações antes de uso financeiro real. As notificações são internas ao painel; canais externos e interface móvel não são parte desta implementação.

Configuração, recursos operacionais reais e semestre precisam ser cadastrados antes dos testes manuais. Não executar seed de dados fictícios no Neon compartilhado. Nenhum commit/push ou aplicação de migração é executado pelos testes.
