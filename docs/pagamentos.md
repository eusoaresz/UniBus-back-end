# Recargas Pix com Stripe

Implementação iniciada em 19/11/2026 para o backend. A carteira manual continua disponível. As novas rotas vinculam uma recarga a um PaymentIntent Stripe e creditam somente após confirmação consultada no servidor. O Pix é avulso; não cria autorização de cobrança recorrente.

## Escolha do provedor

Para recargas locais por Pix, Asaas tem um fluxo direto de cobrança e QR Code. PagBank também oferece pedidos com QR Code Pix e notificações de pagamento. Stripe atende o cenário e permite uma expansão posterior dos meios de pagamento; foi o provedor solicitado para esta implementação. A escolha final para produção deve considerar a disponibilidade na conta e a tarifa efetiva de recebimento, especialmente para recargas pequenas.

Referências oficiais: [Stripe Pix](https://docs.stripe.com/payments/pix), [integração Pix](https://docs.stripe.com/payments/pix/accept-a-payment?payment-ui=direct-api), [webhooks](https://docs.stripe.com/webhooks), [Asaas QR Code](https://docs.asaas.com/reference/obter-qr-code-para-pagamentos-via-pix) e [PagBank Pix](https://developer.pagbank.com.br/reference/criar-pedido-com-qr-code-pix-v2). O SDK atual usa `allowed_payment_method_types` na criação; `payment_method_types` é lido na resposta.

## Configuração

- Aplicar `20261119000100_pagamentos_pix` após as migrações existentes e gerar o Prisma Client. A migração cria `Pagamento` e permite autoria nula nos lançamentos automáticos, preservando os responsáveis dos lançamentos antigos. Nenhuma migração foi executada no banco compartilhado.
- Criar a conta Stripe e confirmar que Pix está disponível para ela. Ainda não existe conta do projeto nem homologação externa realizada.
- Definir `STRIPE_AMBIENTE=teste`, `STRIPE_SECRET_KEY=sk_test_...` e `STRIPE_WEBHOOK_SECRET=whsec_...` nos segredos do backend. Habilitar novas cobranças com `PAGAMENTOS_ATIVOS=true`. O padrão é desligado. Produção exige `STRIPE_AMBIENTE=producao` e chave `sk_live_...`.
- A chave publicável da Stripe pertence à configuração do frontend. Nunca enviar chave secreta ou segredo do webhook ao frontend ou versioná-los.
- Configurar um webhook de eventos snapshot da própria conta para `POST /api/v1/pagamentos/stripe`, por HTTPS. Não usar eventos de contas conectadas (Connect não foi implementado).
- Selecionar `payment_intent.succeeded`, `payment_intent.canceled`, `payment_intent.payment_failed`, `payment_intent.processing`, `charge.refunded`, `charge.dispute.created` e `charge.dispute.closed`.

O corpo bruto é validado pelo SDK oficial com `Stripe-Signature`. O evento apenas identifica o pagamento: seu estado atual é consultado na API Stripe antes de alterar o saldo. Erros não recebem confirmação de sucesso; a Stripe deve reenviar. Configurar e acompanhar falhas de entrega no painel.

Desativar novas cobranças não impede a conciliação de cobranças já emitidas. Manter as credenciais e webhook enquanto houver pagamentos pendentes. Não alternar teste/produção sobre as mesmas cobranças: os ambientes são conferidos e segregados.

## Contrato para o frontend

Rotas de estudante com Bearer, conta ativa e carteira própria. A solicitação aceita cadastro APROVADO ou SUSPENSO. O operador não usa essas rotas como estudante.

| Método | Rota | Finalidade |
| --- | --- | --- |
| POST | `/api/v1/carteira/pix` | Criar ou recuperar a mesma recarga integrada |
| GET | `/api/v1/carteira/pix/:id` | Consultar recarga própria e conciliar com a Stripe |

Corpo do POST:

```json
{ "valor": "10.25", "chaveIdempotencia": "20000000-0000-4000-8000-000000000001" }
```

O valor continua sendo texto decimal, com mínimo R$ 2,00. O teto técnico da integração é R$ 999.999,99, mas a Stripe pode impor limite menor conforme a conta e o Pix; não apresentar esse teto como aprovação garantida. O backend converte o valor em centavos inteiros.

Resposta (201 no POST e 200 no GET):

```json
{
  "id": "uuid-da-recarga",
  "valor": "10.25",
  "status": "PENDENTE",
  "provedor": "STRIPE",
  "statusPagamento": "requires_payment_method",
  "revisaoNecessaria": false,
  "segredoCliente": "pi_..._secret_..."
}
```

1. Gerar uma chave UUID por tentativa de recarga e preservá-la em repetições por timeout. Não gerar outra chave automaticamente ao receber erro. O mesmo valor/chave retorna a mesma recarga; reutilização com outros dados retorna 409.
2. Usar a chave publicável e `segredoCliente` com `stripe.confirmPixPayment`, coletando os dados de cobrança exigidos pela Stripe. Stripe.js apresenta o QR Code/copia e cola e permite informar uma URL de retorno do próprio site. Alternativamente, o front pode mostrar os dados de `next_action.pix_display_qr_code` após confirmar com `handleActions: false`, conforme a documentação oficial.
3. O QR Code é produzido na confirmação com Stripe.js, não no POST inicial do backend. A validade solicitada é de 30 minutos após a confirmação. O comportamento de simulação pode diferir do ambiente real.
4. Ao retornar, consultar a recarga e o saldo da carteira. Somente `status: APROVADA` confirma crédito no UNIBUS. O redirecionamento, captura de tela ou resposta enviada pelo cliente não libera saldo.
5. Não registrar `segredoCliente` em logs/analytics ou armazenamento persistente. Ele só aparece na consulta autenticada do titular enquanto há etapa de pagamento utilizável; não é incluído nas listagens administrativas.
6. Exibir `revisaoNecessaria` como necessidade de atendimento pelo operador. Não repetir criação automaticamente nem informar crédito liberado nesse caso.

401/403: autenticação ou perfil/cadastro sem acesso. 404: recarga ausente ou de outro titular. 409: conflito de chave, ambiente ou pagamento que exige revisão. 502: comunicação de criação inconclusiva; repetir a mesma chave. 503: integração/configuração indisponível.

## Integridade financeira

A recarga e a intenção local são persistidas antes da chamada externa. A criação Stripe usa a mesma chave idempotente em todas as repetições. Se não houver referência salva após 23 horas, o backend bloqueia nova criação com aquela chave para evitar duplicação após a expiração da idempotência no provedor; o operador deve localizar o pagamento na Stripe pelos metadados antes de decidir como resolver. Um webhook válido pode recuperar a referência pela recarga e chave de criação.

O servidor confere referência, chave de criação, ambiente, moeda BRL, método Pix, valor solicitado, valor recebido e cobrança efetivamente paga. O crédito, aprovação e notificação são gravados juntos, em transação serializável. A unicidade do crédito por recarga e da chave financeira evita créditos duplicados, inclusive com webhooks concorrentes.

O valor creditado é o valor nominal pago pelo estudante. Tarifas do provedor não são descontadas do saldo do estudante nesta implementação; devem ser consideradas pelo responsável pelo recebimento.

Lançamentos automáticos têm `realizadaPorId: null`, motivo identificando a Stripe e vínculo com o pagamento. Não é atribuído um operador fictício. A API de aprovação/rejeição manual bloqueia recargas integradas. Recargas manuais e dinheiro mantêm o funcionamento anterior.

## Conciliação e revisão

Uma rotina independente roda a cada 30 segundos e consulta até 20 pagamentos vencidos para conferência. Pendentes são reagendados para consulta em cinco minutos; aprovados são verificados diariamente por até 90 dias após criação. O webhook continua necessário para atualização rápida e eventos fora dessa janela. Servidor suspenso não executa a rotina.

Eventos fora de ordem consultam o estado atual da Stripe. Cancelamento confirmado cancela a recarga sem crédito. Falha de tentativa não significa necessariamente cancelamento definitivo do PaymentIntent; ele pode aguardar nova tentativa.

Devoluções/disputas, pagamento após cancelamento local e estouro do limite de saldo são sinalizados em `Pagamento.revisaoNecessaria`, com aviso aos operadores. Não há débito ou estorno financeiro automático nessas situações. O endpoint de estorno manual bloqueia recargas integradas para não confundir uma alteração de saldo com devolução bancária.

**Limite desta etapa:** a resolução operacional dessas revisões e a solicitação de devolução pela API Stripe ainda precisam de implementação e definição de regras (inclusive saldo já utilizado e devolução parcial). Não realizar estornos diretamente no banco de dados. Validar esse processo antes de disponibilizar recebimentos reais.

## Validação e entrega

Na comparação com a `dev` em 22/11/2026 (`d5061a7`, PR #24), foi identificada a mudança de fotos e comprovantes para a tabela `ArquivoPrivado`. Ela deve ser incorporada antes da entrega da carteira, preservando as migrações de arquivos, push e pagamentos. A migração de arquivos cria a tabela, mas não importa os arquivos antigos do disco: confirmar a transferência dos bytes pelas mesmas chaves antes da troca de armazenamento. Fotos antigas sem registro correspondente na tabela retornam 404.

A combinação da `dev` com push e Pix foi validada em uma cópia local separada, sem alterar o histórico da branch de trabalho. Geração do Prisma e checagem de tipos passaram. A suíte executou 273 testes: 272 passaram e um teste de disciplina falhou por conexão HTTP local interrompida (`ECONNRESET`). A repetição isolada de todo o grupo de operação aprovou os 56 testes, incluindo esse caso. Os testes de Pix, push, armazenamento e preservação de dados nas migrações passaram na suíte completa. Não foi identificada regressão reproduzível nessa combinação; isso não substitui a homologação externa nem confirma o estado do banco publicado.

Em 19/11/2026, a suíte completa sequencial aprovou 272 testes. Após o ajuste final de permissão da consulta Pix, os dez testes de `tests/pix.test.ts` passaram novamente, assim como `npm run typecheck`. Foram conferidos isolamento entre usuários, repetição e concorrência, assinatura, divergências, rollback financeiro, conciliação e sinalização de revisão.

Os testes locais simulam a API Stripe e verificam assinaturas de webhook com o SDK real, sem pagamentos ou contas externas. Ainda são necessários conta Stripe, credenciais de teste, integração da interface, simulação no ambiente Stripe e conferência financeira com PostgreSQL de múltiplas conexões antes de produção. O banco em memória não reproduz todos os conflitos do banco compartilhado.
