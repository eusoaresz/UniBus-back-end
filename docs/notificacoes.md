# Notificações

Base `/api/v1/notificacoes`, com `Authorization: Bearer {{token}}`. Estudantes, motoristas e operadores acessam somente suas próprias configurações e notificações. Não envie usuarioId.

## Configurações

`GET /preferencias` retorna as configurações, inicialmente todas ativadas. `PATCH /preferencias` aceita alterações parciais, com booleanos JSON reais:

```json
{
  "ativadas": true,
  "confirmacoes": true,
  "alteracoesRota": true,
  "cancelamentos": true,
  "lembretes": true,
  "avisosOperador": true,
  "novidades": false,
  "carteira": true,
  "disciplina": true,
  "operacao": true
}
```

`ativadas: false` desativa todos os alertas sem apagar as escolhas individuais. Quando ativadas, cada tema respeita sua própria configuração. Um PATCH vazio, campos extras e valores como `"false"` são rejeitados com 400.

Os eventos continuam registrados quando o alerta está desativado. A configuração não altera saldo, falta, confirmação, cancelamento, aviso ou qualquer regra de negócio. Ao desativar um tema, alertas existentes daquele tema deixam de aparecer e entregas pendentes/com falha são canceladas. Reativar permite novos alertas, sem disparar os eventos antigos. Não há provedor externo nem entregas em processamento nesta implementação.

## Central e histórico

| Método | Caminho | Uso |
|---|---|---|
| GET | `/alertas` | Alertas habilitados, respeitando as configurações atuais |
| GET | `/nao-lidas` | Quantidade de alertas habilitados ainda não lidos |
| GET | `/` | Histórico, incluindo eventos cujos alertas foram desativados |
| PATCH | `/:id/lida` | Marca como lida; repetir mantém a data original |

Consultas de listas aceitam `pagina`, `limite` (máximo 100), `somenteNaoLidas=true` e `tema`. Exemplo: `GET /alertas?tema=CONFIRMACOES&somenteNaoLidas=true&pagina=1&limite=20`.

Temas: `CONFIRMACOES`, `ALTERACOES_ROTA`, `CANCELAMENTOS`, `LEMBRETES`, `AVISOS_OPERADOR`, `NOVIDADES`, `CARTEIRA`, `DISCIPLINA` e `OPERACAO`.

As listas retornam `dados` e `meta` (pagina, limite, temProxima). Cada item contém id, tipo, tema, titulo, mensagem, criadoEm e lidaEm. Não retornam CPF, credenciais, destino de entrega, chave de deduplicação ou dados internos. Uma notificação inexistente ou pertencente a outro usuário retorna 404 ao tentar marcar a leitura. Sem autenticação: 401.

O front deve usar `/alertas` para exibir alertas e `/nao-lidas` para o contador. `/` serve para consulta explícita do histórico; não deve produzir banners ou notificações do dispositivo. A antiga `/api/v1/carteira/notificacoes` continua como consulta histórica para compatibilidade.

## Integrações

Confirmação, cancelamento, mudança de rota/horário, carteira, disciplina e operação registram o evento e a decisão de alerta dentro da transação do domínio, preservando deduplicação e rollback.

O job iniciado pelo servidor processa também notificações a cada ciclo operacional de aproximadamente 30 segundos. Publicações de avisos ativos são distribuídas aos usuários ativos do público correspondente; avisos expirados, arquivados, futuros ou de outro perfil não são exibidos. O processamento é paginado e não duplica notificações. Cada ciclo distribui até 100 avisos ainda não registrados por usuário; os demais ficam para o ciclo seguinte. Editar o texto de um aviso não dispara nova notificação. A consulta completa e atualizada do conteúdo continua nas rotas de avisos.

Participações confirmadas recebem um lembrete na janela de 30 minutos antes da saída. Canceladas, esperas e trechos iniciados não geram lembrete de embarque. O lembrete é deduplicado por participação, ciclo de confirmação e horário de saída. Se o servidor ficar desligado durante toda a janela, ele não envia um lembrete atrasado após a saída. Alteração de horário também tem seu próprio alerta, controlado por `lembretes`.

`novidades` está disponível para futuras publicações desse tema; não há fonte de promoções nem rota pública para criar notificações arbitrárias. O código central de registro aceita o tema para integração futura.

Esta entrega fornece alertas internos via API. O front precisa consultá-la para mostrá-los. Push/WhatsApp/e-mail de notificações e silenciamento temporário não fazem parte desta entrega. Um provedor futuro deve revalidar as configurações imediatamente antes do envio e respeitar entregas canceladas.

## Migração e testes

Aplicar `20261101000500_notificacoes_preferencias` após as migrações existentes e gerar o Prisma Client. A migração preserva o histórico e classifica os eventos antigos de viagens/carteira. Não foi aplicada automaticamente no Neon.

`tests/notificacoes.test.ts` verifica a API com Prisma e PostgreSQL em memória, incluindo permissões, temas, configuração geral, não repetição de alertas antigos, rollback, leitura, avisos e lembretes.
