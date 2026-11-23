# Web Push e expansão para Expo

O site atual usa Next.js. Esta etapa implementa o canal WEB no backend; não migra o frontend para Expo. O serviço de push do Expo não atende navegadores. O cadastro existente de dispositivos preserva `expoPushToken` para uma futura integração nativa, sem simular suporte Android/iOS nesta entrega.

Referências: [Expo e serviços de notificações](https://docs.expo.dev/guides/using-push-notifications-services/), [PushSubscription](https://developer.mozilla.org/en-US/docs/Web/API/PushSubscription), [biblioteca Web Push](https://github.com/web-push-libs/web-push), [Web Push no Safari/iOS](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).

## Configuração do backend

1. Aplicar a migração `20261118000100_web_push` e gerar o Prisma Client no processo de deploy. A migração acrescenta os dados Web Push e torna o token Expo opcional, preservando dispositivos existentes. Não foi aplicada automaticamente em banco remoto.
2. Gerar um par VAPID por ambiente com `npx web-push generate-vapid-keys --json`. Guardar a chave privada exclusivamente nos segredos do backend. Não versionar a saída nem compartilhar a chave privada com o frontend.
3. Configurar `WEB_PUSH_SUBJECT` com um contato real `mailto:`, `WEB_PUSH_PUBLIC_KEY` e `WEB_PUSH_PRIVATE_KEY`; habilitar `WEB_PUSH_ENABLED=true`. O padrão é desligado. Não regenerar chaves em cada deploy: trocar o par exige novas inscrições dos navegadores.
4. Manter o processo do servidor ativo. O worker roda independentemente das viagens, aproximadamente a cada 30 segundos, sem sobreposição no processo. Se a hospedagem suspender o servidor, os envios ficam suspensos também.

Não requer conta Expo nem projeto Firebase para este canal. A biblioteca envia ao serviço escolhido pelo navegador. Destinos aceitos: `fcm.googleapis.com`, `updates.push.services.mozilla.com` e subdomínios de `push.apple.com`, somente HTTPS padrão, sem credenciais. Outros provedores exigem revisão explícita da lista; não aceitar URL arbitrária vinda do cliente.

## Contrato para a equipe do frontend

Base `/api/v1/notificacoes`, sempre com Bearer de conta ativa. O backend obtém o usuário do token.

| Método | Caminho | Resposta |
| --- | --- | --- |
| GET | `/push/configuracao` | `{ "habilitado": true, "chavePublica": "..." }`; desligado retorna false/null |
| POST | `/push/inscricoes` | Recebe `PushSubscription.toJSON()`; retorna id, plataforma WEB, ativo e datas; 200 também na repetição |
| GET | `/push/inscricoes` | Navegadores ativos da própria conta, sem endpoint, chaves ou sessão |
| DELETE | `/push/inscricoes/:id` | Desativa e cancela entregas pendentes; `{ "removido": true }`; repetir mantém sucesso |

Corpo do POST (valores abaixo são ilustrativos, as chaves reais vêm do navegador):

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/identificador",
  "expirationTime": null,
  "keys": { "p256dh": "chave-publica-do-navegador", "auth": "segredo-da-inscricao" }
}
```

Até dez navegadores ativos por conta. 400: payload, chave ou endpoint inválido/expirado. 401: autenticação ausente ou inválida. 403: conta sem acesso. 404: inscrição ausente ou de outro usuário. 409: limite ou inscrição vinculada a outra conta. 503: canal ainda não habilitado.

Fluxo a implementar no frontend:

1. Detectar `serviceWorker`, `PushManager` e `Notification` em contexto seguro (HTTPS; localhost para desenvolvimento). Consultar a configuração antes de oferecer ativação.
2. Registrar o service worker no domínio do site. Pedir permissão após o usuário acionar “Ativar notificações”, sem insistir quando negada.
3. Usar `pushManager.getSubscription()` ou `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`, com a chave pública VAPID convertida para Uint8Array. Enviar `subscription.toJSON()` ao POST e guardar o id retornado associado à conta local.
4. No login, registrar novamente a inscrição para associá-la à sessão atual. Na troca de conta, desativar a inscrição anterior e fazer `unsubscribe()` antes de criar outra. O backend rejeita transferência silenciosa entre usuários. Se receber 409 por vínculo anterior, recriar a inscrição no navegador.
5. No logout, executar a rota de logout do backend antes de apagar o token e chamar `unsubscribe()` no navegador. O backend desativa as inscrições associadas à sessão encerrada e cancela suas entregas, sem afetar outras sessões. Se o logout não alcançar o servidor, a revogação remota não é garantida; o frontend deve concluir a remoção da inscrição no navegador.
6. Tratar `pushsubscriptionchange` e revalidar a inscrição ao abrir o site. Para desativar manualmente, chamar DELETE e `unsubscribe()`.
7. Em iPhone/iPad, orientar a adição do site à tela inicial e verificar suporte antes de oferecer ativação; Web Push requer web app na tela inicial em iOS/iPadOS 16.4 ou posterior. Implementar manifest e experiência de instalação na equipe do front.

Evento recebido pelo service worker:

```json
{
  "titulo": "UniBus",
  "mensagem": "Você tem uma nova notificação no UniBus.",
  "notificacaoId": "uuid",
  "tag": "unibus:uuid"
}
```

Usar `event.waitUntil(registration.showNotification(...))`, com `tag` para agrupar reentregas. No clique, abrir/focar a central de notificações do próprio site e exigir login quando necessário. O frontend escolhe a rota da central; não interpretar URLs externas do payload. Consultar a API autenticada para o conteúdo completo. Não marcar como lida ao receber push: usar a rota de leitura quando o usuário abrir a notificação. Não esconder silenciosamente o evento push: os navegadores esperam uma notificação visível.

## Entrega e privacidade

Cada novo evento habilitado cria uma entrega por navegador ativo dentro da mesma transação do evento. Rollback desfaz ambos. Registrar um navegador, repetir um evento ou reativar preferências não envia histórico antigo. Atualizar chaves ou reativar uma inscrição cancela sua fila anterior.

Antes do envio, o worker revalida propriedade e situação do dispositivo/usuário, preferências, leitura e validade/público de avisos. Eventos com mais de uma hora são cancelados; o TTL no provedor é de cinco minutos. O push é um aviso genérico: não expõe saldo, disciplina, documento ou texto de avisos na tela bloqueada.

O worker busca lotes de até 50 entregas, reserva cada uma atomicamente e recupera reservas abandonadas após cinco minutos. Timeout de rede: dez segundos. Falhas de rede, 429 e 5xx permitem até cinco tentativas, com intervalos de 1, 2, 4 e 8 minutos. 404/410 desativam o navegador e cancelam sua fila. Demais falhas HTTP encerram as tentativas daquela entrega; corrigir credenciais/configuração antes de novos eventos. Só códigos sanitizados são persistidos, sem resposta bruta ou chaves do provedor.

`ENVIADA` significa aceitação pelo provedor, não comprovação de exibição ou leitura. Uma interrupção após o provedor aceitar e antes de salvar o resultado pode gerar reentrega; usar a mesma `tag` no frontend. Mudanças de preferência/logout não recolhem uma mensagem já em trânsito. A central autenticada permanece a fonte do conteúdo.

## Expansão para aplicativo

Quando houver app Expo, acrescentar cadastro/validação dos tokens nativos e um adaptador de envio e consulta de recibos Expo. Reutilizar o registro de eventos, preferências e entregas, distinguindo a plataforma. Esta entrega não aceita tokens Expo pelas rotas Web Push e não envia para dispositivos nativos legados.

## Validação

Em 18/11/2026, `npm run typecheck` e a suíte completa `npx tsx --test --test-concurrency=1 tests/*.test.ts` passaram: 262 testes, incluindo dez cenários de Web Push. A execução sequencial evita a sobrecarga observada nos testes de banco em memória executados em paralelo.

Os testes usam PostgreSQL em memória e transporte simulado, sem enviar mensagens externas. É necessário concluir a integração do frontend e testar um navegador real com as chaves VAPID do ambiente antes de declarar o fluxo publicado validado.
