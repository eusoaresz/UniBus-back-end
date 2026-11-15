# Alinhamento front e backend — 15/11/2026

## Referências

- Backend: `eusoaresz/UniBus-back-end`, base `dev` em `e0ea4a8`.
- Estudante: `LuanSchwartz/UniBus_FrontEnd`, `main` em `57607b0`.
- Operador: `eusoaresz/operador-front-end`, `main` em `b13e706`.

Comparação do código e dos contratos HTTP. As alterações desta entrega ficam somente no backend. Os ajustes locais anteriores do painel não fazem parte desta entrega.

## Compatibilidade encontrada

| Fluxo | Situação e contrato |
| --- | --- |
| Login e perfil | Os frontends usam `/auth/login` e `/usuarios/me`, com Bearer. Token expira em uma hora. |
| Foto própria | O estudante já usa PUT multipart com campo `foto` e DELETE sem corpo em `/usuarios/me/foto`. A API já oferece esse fluxo. JPEG/PNG, até 5 MB e 16 megapixels. |
| Preferências | GET/PATCH `/preferencias/me` e GET `/preferencias/opcoes` são compatíveis. Arrays vazios representam ausência de restrição visual. |
| Notificações | Preferências em `/notificacoes/preferencias` são compatíveis. São notificações internas; push/WhatsApp continuam fora desta integração. |
| Viagens | Trechos e participações retornam arrays paginados. Inscrição utiliza IDs das paradas do trecho. Cobrança, fila e cancelamento são decididos pela API. |
| Carteira | Valores decimais em texto; recarga via POST `/carteira/recargas` com `valor` e `chaveIdempotencia`. Conferência do Pix é manual. |
| Operador | Cadastros, escalas, viagens, operação, disciplina e finanças já têm rotas e telas no painel existente. A próxima etapa deve partir dessa base. |

## Ajustes no backend nesta entrega

- A lista de trechos passa a retornar `inscricoesSuspensas`, como já fazia o detalhe. Antes, a tela podia oferecer uma ação que seria recusada por suspensão.
- Lista e detalhe retornam `viagem.rotaId`, permitindo comparar preferências sem depender do nome histórico da rota.
- A lista aceita filtros opcionais de data local da saída, turno, rota e sentido, mantendo o array e os parâmetros de paginação existentes. Exemplo: `GET /api/v1/operacao/trechos?data=2026-11-16&turno=NOITE&sentido=VOLTA&pagina=1&limite=20`.
- Participações retornam `confirmacaoTardia`, além do `limiteEstornoEm` já existente. Isso permite à tela distinguir a janela excepcional de cancelamento.
- A documentação de escalas passa a refletir a geração automática já implementada no backend.

Sem migração ou alteração de banco, tarifa, saldo mínimo, prazos, permissões ou geração automática. Os filtros são opcionais e os novos campos são adicionais.

## Repassar à equipe do estudante

1. **Pontos de embarque/desembarque:** `alternarPresenca` atualmente escolhe a primeira e a última parada. Implementar seleção entre as paradas do trecho; enviar `origemId` e `destinoId` de `ParadaTrecho`. O backend não deve presumir a instituição do estudante como destino obrigatório.
2. **Cancelamento tardio:** incluir `confirmacaoTardia` e `limiteEstornoEm` no tipo da participação e no cálculo do botão. A janela excepcional é de até 30 minutos, limitada à saída e ao início real. Na espera, pode desistir até antes da saída, sem débito. A resposta da API prevalece sobre o estado visual.
3. **Preferências:** comparar `viagem.rotaId` com `rotaIds`, não nomes. Hoje `combinaComPreferencias` considera rotas e turnos, mas ignora `cidadeIds`. É necessário alinhar com o responsável se cidade significa origem, destino ou qualquer parada antes de aplicar esse filtro; a API não deve adivinhar essa regra.
4. **Calendário:** a tela atual baixa todas as páginas e filtra localmente. Pode adotar os novos filtros para a consulta do dia. Preservar uma estratégia para os indicadores de dias com viagens, que hoje dependem da lista completa. A volta pode pertencer ao dia seguinte à ida.
5. **Extrato:** `listarTransacoes` esconde cobrança de passagem e estorno correspondente. Manter os lançamentos visíveis para preservar a compreensão do histórico financeiro. Paginar extrato e recargas: hoje a tela carrega somente os 20 mais recentes de cada consulta.
6. **Logout:** a implementação atual ignora falha de revogação e remove o token local mesmo assim. Tratar a falha e informar que a saída no servidor não foi confirmada. A API revoga apenas quando o POST conclui.
7. **Pix:** a chave e o QR são gerados no frontend; a chave padrão é de exemplo. Configurar a chave correta no ambiente e não apresentar a solicitação como pagamento aprovado. O saldo só muda após aprovação do operador.

## Repassar à equipe do operador

- Escala ativa com horários completos habilita geração/publicação automática dos próximos 30 dias; a rotina roda ao iniciar o servidor e a cada seis horas. Na criação, enviar `ativa: false` quando for apenas preparação. Alterar/desativar não muda viagens existentes. Conferir [escalas](escalas.md).
- O painel publicado ainda não oferece foto própria no perfil; integrar as rotas `/usuarios/me/foto`. A alteração administrativa da foto de outro cadastro continua exigindo motivo.
- Manter chaves de idempotência em repetições de aprovação, registro de dinheiro e estorno. Não presumir que uma falha de rede desfez a operação financeira.

## Limites e sequência

Validação local desta entrega: `npm run typecheck` aprovado e `npm test` com 244 testes aprovados, sem falhas. Os novos testes HTTP verificam filtros combinados, paginação, virada do dia no UTC-3, exclusão de rascunhos, suspensão de inscrições e janela de cancelamento tardio sem expor a participação de outro estudante. Os testes usam banco isolado em memória.

A comparação de código não substitui teste visual completo. Nesta sessão, a API publicada respondeu ao login de teste do operador, consulta do perfil, escalas, viagens e logout; esses testes foram feitos antes desta entrega e não validam os campos novos. A automação do navegador apresentou falha de conexão. Não houve escrita de cadastros ou movimentações no ambiente real.

Após integrar os ajustes de frontend, conferir em ambiente de teste: cadastro e ativação, seleção de paradas, confirmação e fila, cancelamento normal e tardio, extrato com estorno, recarga manual e geração de viagens por escala. Só então tratar os fluxos como uniformes e avançar nas próximas funcionalidades do operador.
