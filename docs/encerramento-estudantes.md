# Encerramento e reabertura de estudantes

Rotas exclusivas de operador ativo:

- POST `/api/v1/estudantes/:id/encerrar`
- POST `/api/v1/estudantes/:id/reabrir`

O ID é do estudante. Ambas recebem motivo obrigatório de 3 a 1000 caracteres. Não há exclusão física.

```json
{
  "motivo": "Conclusão do curso e saída do programa"
}
```

## Encerramento

O cadastro acadêmico passa a ENCERRADO. O estado da conta de usuário não é modificado: contas ativas mantêm login e acesso de consulta; bloqueios administrativos ou disciplinares existentes continuam valendo. O encerramento não ativa contas que aguardavam ativação.

Estudante encerrado pode consultar seus dados, carteira, extrato e históricos pelas rotas próprias. As rotas autenticadas de escrita são bloqueadas, incluindo edição própria de nome/telefone, preferências, solicitação Pix, comprovantes e inscrições. Recuperação de senha segue o fluxo de segurança existente. O serviço de solicitação Pix também valida o estado acadêmico dentro da transação.

Antes de encerrar, devem ser resolvidos todos os pedidos de recarga PENDENTE. Participação CONFIRMADA em trecho EM_ANDAMENTO também impede o encerramento. Uma falha nessas verificações preserva o cadastro e suas participações.

Participações confirmadas em trechos ainda não iniciados (rascunho, aberto ou fechado) são canceladas com estorno integral da cobrança, inclusive quando o prazo normal de cancelamento terminou. Isso também resolve trechos cuja saída prevista passou, mas ainda não foram iniciados. Participações em espera são retiradas da fila sem cobrança. Trechos já concluídos não recebem estorno por encerramento.

Vagas liberadas seguem a promoção normal da fila antes do corte; depois do corte, a confirmação continua dependendo do operador. Encerramento não passa por cima dessa regra.

Saldo positivo ou negativo é permitido e preservado, além dos estornos de participações canceladas. Não há zeramento, perdão de dívida nem devolução bancária automática. Carteira, recargas, movimentações, faltas e participações históricas continuam vinculadas ao mesmo estudante.

Cadastro, cancelamentos, estornos, promoção da fila e auditoria pertencem à mesma transação. Falha em qualquer parte desfaz tudo. Repetir o encerramento de um cadastro já ENCERRADO retorna o estado existente e não duplica estornos.

## Reabertura

Exige cadastro ENCERRADO e unidade, instituição e ponto de parada ativos. Caso a unidade antiga não esteja disponível, o operador pode corrigir o vínculo pelo fluxo cadastral antes de reabrir.

A reabertura retorna o cadastro a APROVADO, preservando carteira e histórico. Não restaura participações canceladas, não libera advertências, não remove bloqueios disciplinares e não altera o status da conta de usuário. Nova inscrição exige novamente todas as condições operacionais e financeiras.

## Auditoria administrativa

AlteracaoPerfil registra autor, motivo e estados anterior/novo de encerramento e reabertura. O mesmo histórico passa a registrar alterações administrativas de status de todos os perfis, edição acadêmica e aprovação/rejeição/suspensão/reativação. Não registra senhas ou CPF.

Os contratos antigos agora exigem motivo:

- PATCH `/api/v1/usuarios/:id/status`, para qualquer perfil.
- PATCH `/api/v1/estudantes/:id`.
- POST `/api/v1/estudantes/:id/aprovar`, `/rejeitar`, `/suspender` e `/reativar`.
- PATCH `/api/v1/avisos/:id` e `/api/v1/avisos/:id/status`.

A aprovação acadêmica utiliza motivo no lugar do antigo campo observacao opcional. Essas mudanças exigem atualização dos clientes HTTP e interfaces existentes. Avisos usam AlteracaoAviso para preservar criação, edição e arquivamento; o autor e os estados ficam registrados na mesma transação da mudança.

Esta etapa não cria uma interface de consulta dos históricos administrativos antigos: os registros persistentes ficam no banco, com acesso administrativo. As rotas de histórico dos novos catálogos continuam disponíveis conforme seus contratos.

## Migração e validação

`20261101000400_encerramento_auditoria` acrescenta ENCERRADO ao enum acadêmico e cria o histórico de avisos. Não encerra cadastros existentes nem altera saldos. A aplicação no Neon depende de revisão e coordenação entre os desenvolvedores.

Testes usam PGlite isolado e verificam permissões, bloqueio de escrita, recargas pendentes, trecho em andamento, estorno único, preservação de saldo negativo, reabertura com restrições e rollback em falha da auditoria. A concorrência com múltiplas conexões em PostgreSQL permanece pendente antes do uso real.
