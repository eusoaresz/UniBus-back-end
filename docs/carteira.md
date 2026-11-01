# Carteira manual

Implementa saldo, extrato, Pix solicitado pelo estudante, aprovação/rejeição pelo operador, dinheiro registrado pelo operador, estorno integral de recarga e integração com o cadastro unificado de estudantes. A carteira é criada com saldo 0.00 e limite 20.00. A matrícula é única por unidade de ensino.

## Acesso

Rotas exigem JWT e conta ativa. O estudante aprovado ou suspenso pode consultar sua própria carteira e solicitar Pix. Pendente ou rejeitado não acessa. Conta bloqueada não acessa. Operadores consultam todas as carteiras e analisam recargas. Operador não exerce o papel de estudante. Motorista não acessa essas rotas.

O módulo de estudantes registra Usuário, Estudante aprovado presencialmente e Carteira na mesma transação. A conta de acesso nasce AGUARDANDO_ATIVACAO, conforme o fluxo de usuários existente; o operador ativa em PATCH /api/v1/usuarios/:id/status. Isso não é uma segunda aprovação da matrícula. Não há cadastro público de operador.

## Contrato

Prefixo `/api/v1`. Enviar `Authorization: Bearer <token>` e JSON. IDs e chaves de idempotência são UUIDs.

| Método | Rota | Acesso e corpo |
| --- | --- | --- |
| GET | /carteira | Saldo próprio |
| GET | /carteira/extrato | Extrato próprio |
| GET | /carteira/recargas | Pedidos próprios |
| POST | /carteira/recargas | Estudante: valor, chaveIdempotencia |
| GET | /carteira/notificacoes | Avisos próprios dentro do aplicativo |
| GET | /operador/carteiras | Operador: filtros nome ou cpf completo |
| GET | /operador/carteiras/:estudanteId | Carteira do estudante |
| GET | /operador/carteiras/:estudanteId/extrato | Extrato do estudante |
| GET | /operador/recargas | Pedidos, responsáveis e quantidade pendente por estudante |
| POST | /operador/recargas/:id/aprovar | chaveIdempotencia |
| POST | /operador/recargas/:id/rejeitar | chaveIdempotencia, motivo opcional |
| POST | /operador/recargas/dinheiro | estudanteId, valor, chaveIdempotencia |
| POST | /operador/recargas/:id/estornar | chaveIdempotencia, motivo obrigatório |
| POST | /estudantes | nome, cpf, email, telefone, senha, unidadeEnsinoId, matricula, previsaoConclusao |

Listas aceitam pagina e limite (padrões 1 e 20, máximo 100 por página). Retornam dados e meta com temProxima. Extrato ordena mais recentes primeiro. Recargas aceitam status e ordem asc/desc, com padrão asc. Não há upload de comprovante, código Pix obrigatório, cancelamento de pedido pelo estudante ou endpoint de ajuste livre de saldo.

Exemplo de solicitação Pix:

```json
{
  "valor": "10.25",
  "chaveIdempotencia": "20000000-0000-4000-8000-000000000001"
}
```

Valores são texto com ponto decimal, no máximo duas casas. As respostas usam sempre duas casas. Recarga mínima 2.00; o limite técnico de Decimal(10,2) é 99999999.99, inclusive para o saldo resultante. Números JSON, vírgulas, notação científica, valores negativos e casas excedentes são recusados.

Pedido Pix não credita saldo. A aprovação credita e registra operador/data. Dinheiro já nasce aprovado. Recarga aprovada permanece APROVADA mesmo após estorno; credito.estorno identifica sua correção, preservando o registro original. O estorno exige motivo, é integral e não pode deixar saldo abaixo de -20.00. Repetição da mesma operação não repete seu efeito; reutilização de chave com dados incompatíveis retorna 409.

O operador confere o pagamento no extrato bancário. A lista apresenta nome, matrícula, unidade, valor, horário, solicitante e responsável pela análise; não devolve CPF, senha ou dados bancários. A quantidade pendente ajuda na conferência, mas não detecta duas solicitações diferentes para um mesmo Pix. identificadorPagamento permanece sem uso. Registros antigos podem ter solicitante desconhecido, representado por null.

As notificações são gravadas junto à transação financeira e consultadas no aplicativo. Push, WhatsApp e integração bancária não estão implementados.

## Serviço financeiro interno

`debitar(tx, dados)` e `estornar(tx, dados)` recebem a mesma transação Prisma utilizada pela operação de viagem. Não existe rota HTTP de débito livre. Débito exige participação confirmada, ciclo correspondente, valor igual à tarifa do trecho e carteira do estudante da participação. A cobrança deve ocorrer no mesmo commit da confirmação da vaga. O módulo de operação utiliza esses serviços na confirmação e no cancelamento dentro da mesma transação; consulte operacao.md.

`executarTransacao` utiliza Serializable, com até três tentativas para conflito de concorrência. A carteira também é atualizada comparando sua versão; uma leitura antiga não pode sobrescrever saldo novo. O extrato é somente inclusão, protegido por trigger contra UPDATE e DELETE. Idempotência e estorno único são protegidos por restrições no banco.

## Migração

Aplicar após a migração de viagens. A migração da carteira converte COBRANCA_EMBARQUE dos dados de teste para COBRANCA_CONFIRMACAO, preserva valores, vincula participação e ciclo e mantém a referência ao embarque para rastreabilidade. Um motivo identifica a conversão. Não recalcula saldos nem cria débitos. Matrículas duplicadas por unidade, vínculos inconsistentes e valores fora das novas regras interrompem a transação.

A migração também cria carteiras zeradas para estudantes antigos que ainda não possuem carteira, sem modificar carteiras existentes. Aprovação e reativação preservam saldo e garantem a existência da carteira.

Não executada no Neon. Antes de aplicar no compartilhado, revisar com o colega e ensaiar em uma cópia. Não substituir por db push ou apagar dados para contornar falhas.

## Testes e limites

Os testes da carteira usam a API HTTP, Prisma e PostgreSQL em memória via PGlite, com adaptador exclusivo de testes. Cobrem crédito, débito, estorno, rollback, permissões, repetição, matrícula e chamadas simultâneas. PGlite serializa transações em uma conexão: esses testes verificam resultados e comparação de versão, mas não reproduzem todos os conflitos entre múltiplas conexões no PostgreSQL de produção. Validar também com PostgreSQL dedicado antes de disponibilizar operações financeiras reais.

Ainda pendentes: interface do aplicativo, validação financeira em PostgreSQL com múltiplas conexões, push e pagamentos integrados. Operação já implementa confirmação/fila, alocação/publicação e disciplina, com os limites documentados em operacao.md. O ZIP contém o backend; não é uma interface gráfica pronta.
