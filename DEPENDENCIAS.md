# Dependências do UniBus back-end

Este documento descreve as dependências instaladas no projeto e a função de cada
uma delas na API.

## Dependências de execução

### `express`

Framework HTTP para Node.js. É usado para criar o servidor da API, definir
rotas, receber requisições e enviar respostas HTTP.

No módulo de usuários, ele fornece o `Router` usado para organizar as rotas de
cadastro, login e recuperação de senha.

### `zod`

Biblioteca de validação e definição de schemas. Valida os dados recebidos no
corpo das requisições antes que eles sejam processados pela aplicação.

No módulo de usuários, valida nome, CPF, e-mail, telefone, perfil, senha e
código de recuperação.

### `bcrypt`

Biblioteca para criar e comparar hashes de senhas. A senha original não deve
ser armazenada no banco de dados.

Uso previsto:

- gerar `senhaHash` no cadastro;
- comparar a senha do login com `Usuario.senhaHash`;
- gerar o hash do código de recuperação antes de armazená-lo em
  `TokenAcesso.tokenHash`.

### `jsonwebtoken`

Biblioteca para criar e verificar tokens JWT. Os tokens identificam o usuário
autenticado sem que a senha seja enviada em cada requisição.

Uso previsto:

- gerar um token após o login;
- verificar o token no middleware de autenticação;
- proteger rotas como a listagem de usuários.

### `dotenv`

Carrega variáveis de ambiente a partir de um arquivo `.env`. É usado para
manter configurações sensíveis fora do código-fonte.

Exemplos de configurações que podem ser carregadas:

- `JWT_SECRET`;
- `DATABASE_URL`;
- `SMTP_USER`;
- `SMTP_PASSWORD`;
- `PORT`.

O arquivo `.env` não deve ser versionado no Git.

### `@prisma/client`

Cliente gerado pelo Prisma para acessar o banco de dados usando TypeScript.

No projeto, ele é usado para consultar e alterar os modelos definidos em
`prisma/schema.prisma`, especialmente:

- `Usuario`;
- `TokenAcesso`.

Os campos de senha usados pela aplicação são `Usuario.senhaHash` e
`TokenAcesso.tokenHash`.

## Dependências de desenvolvimento

### `typescript`

Compilador e sistema de tipos para TypeScript. Detecta inconsistências de
tipos antes da execução e transforma arquivos `.ts` em JavaScript quando a
aplicação é compilada.

Ele ajuda a verificar, por exemplo, se os dados enviados ao Prisma correspondem
aos tipos definidos no schema do banco.

### `prisma`

Embora não estivesse na lista inicial, o projeto já possui o pacote `prisma`
como dependência de desenvolvimento. Ele fornece a CLI usada para:

- validar o schema;
- gerar o Prisma Client;
- criar e aplicar migrações;
- consultar o estado das migrações.

## Versões instaladas

As versões registradas no `package.json` são:

| Pacote | Versão |
|---|---:|
| `express` | `^5.3.0` |
| `zod` | `^4.6.7` |
| `bcrypt` | `^6.0.0` |
| `jsonwebtoken` | `^9.0.3` |
| `dotenv` | `^18.0.8` |
| `@prisma/client` | `^7.10.0` |
| `typescript` | `^7.0.2` |
| `prisma` | `7.10.0` |

## Observações

Após instalar ou alterar o schema Prisma, pode ser necessário executar:

```powershell
npx prisma generate
```

O npm informou quatro vulnerabilidades de alta severidade durante a instalação.
A correção automática com `npm audit fix --force` não foi executada, pois ela
pode introduzir atualizações incompatíveis. O relatório pode ser consultado
com:

```powershell
npm audit
```
