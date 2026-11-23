# Login, recuperação e logout

Base `/api/v1/auth`. O cadastro, carteira, preferências e históricos ficam no PostgreSQL. Logout, fechar o aplicativo e expiração do token não removem esses dados. Ao fazer novo login, consultar `/usuarios/me`, `/estudantes/me`, `/carteira` e `/preferencias/me` com o token novo.

## Login

`POST /login`, Body JSON:

```json
{"email":"aluno@example.com","senha":"SenhaForte123!"}
```

Retorna 200 com `token`. Usar `Authorization: Bearer {{token}}` nas rotas protegidas. O token expira em uma hora e não contém CPF, contato ou senha. Conta bloqueada/inativa não entra. E-mail/senha incorretos retornam 401.

Fechar e reabrir o aplicativo não é logout. Se o front preservar a credencial em armazenamento apropriado à plataforma, pode reutilizá-la enquanto válida. Depois da expiração, solicita login novamente. Não há refresh token nem login permanente nesta entrega. Os dados permanecem no banco independentemente da validade do token; sua persistência depende também da operação e backup do banco, não do cache do aplicativo.

## Recuperação com Mailtrap

`POST /recuperar-senha`:

```json
{"email":"aluno@example.com"}
```

Para uma conta existente, envia um código numérico de seis dígitos, válido por 15 minutos. Somente seu hash é salvo. A resposta pública é a mesma para e-mail existente/desconhecido e nunca contém o código. Reenvio invalida o código anterior. Falha de SMTP também mantém a resposta genérica, invalida o código emitido e gera log sem dados pessoais.

`POST /redefinir-senha`:

```json
{"email":"aluno@example.com","codigo":"123456","novaSenha":"NovaSenha123!"}
```

O código é de uso único e precisa corresponder ao e-mail. A senha usa as regras existentes (mínimo 8 caracteres, maiúscula, minúscula, número e símbolo). Sucesso: 200. Código inválido, expirado ou reutilizado: 400. Redefinição invalida os tokens de acesso anteriores; o usuário faz novo login, preservando os dados.

O SMTP atual usa `sandbox.smtp.mailtrap.io:2525`. Configurar `MAILTRAP_USER`, `MAILTRAP_PASS` e `SMTP_FROM` no `.env`, sem versionar credenciais. Nesse modo, a mensagem é capturada na caixa de testes do Mailtrap, com destinatário igual ao e-mail digitado. Ela não é entregue à caixa pessoal real. Envio real exige configurar o serviço de envio de e-mail e seu domínio posteriormente.

## Logout

`POST /logout`, sem corpo, com `Authorization: Bearer {{token}}`. Sucesso: **204, sem JSON**. O servidor grava somente o hash SHA-256 do token na lista de revogação; toda rota protegida consulta essa lista. O token não pode ser reutilizado para acessar dados. Repetir o logout com o mesmo token ainda válido retorna 204. Tokens expirados/inválidos ou ausentes retornam 401.

O logout afeta somente o token enviado. Outro aparelho continua conectado. Contas bloqueadas e estudantes encerrados podem sair sem receber acesso às demais ações. A rota mantém os bloqueios comuns em todas as outras operações.

No front: chamar logout, remover o token local, limpar o estado/cache da sessão e voltar ao login. Se o aparelho estiver sem rede, apagar a credencial local não confirma revogação no servidor; ele pode informar a falha e tentar novamente quando houver conexão. O servidor preserva o cadastro.

Não há exclusão de conta nesse fluxo. A tabela de tokens revogados pode ter seus registros expirados removidos por manutenção, pois JWT expirado já é rejeitado antes de qualquer acesso.

## Migração e Bruno

Aplicar `20261101000600_logout_revogacao`, gerar o Prisma Client e reiniciar o servidor. A migração não foi aplicada automaticamente no Neon. JWTs antigos assinados com expiração continuam aceitos até expirarem, salvo revogação por logout/redefinição. JWTs sem expiração são rejeitados.

No Bruno, com `baseUrl` já terminando em `/api/v1`:

1. `POST {{baseUrl}}/auth/login`, salvar o token retornado.
2. `GET {{baseUrl}}/usuarios/me` com Bearer: 200.
3. `POST {{baseUrl}}/auth/logout` com o mesmo Bearer: 204.
4. Repetir a consulta com o token antigo: 401.
5. Entrar novamente e consultar: mesmos dados, token novo.
6. Solicitar recuperação, consultar a caixa Mailtrap e redefinir com o código.
7. Conferir que a senha antiga e os tokens anteriores não dão acesso.

O login com Google e o cadastro público mostrados no desenho permanecem fora desta entrega. O cadastro segue as rotas administrativas já existentes. Onboarding e botão de mostrar senha são comportamentos da interface.
