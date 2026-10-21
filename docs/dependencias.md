# Dependências

As versões utilizadas são definidas em `package.json` e fixadas em `package-lock.json`. Use `npm ci` para reproduzir a instalação.

| Pacote | Finalidade |
|---|---|
| express | Servidor HTTP e rotas |
| zod | Validação dos dados recebidos |
| bcrypt | Hash de senhas e códigos de recuperação |
| jsonwebtoken | Emissão e validação de JWT |
| dotenv | Leitura de configuração local do `.env` |
| @prisma/client | Cliente de acesso ao banco |
| @prisma/adapter-pg | Adaptador PostgreSQL para Prisma |
| pg | Driver PostgreSQL |
| nodemailer | Envio de mensagens via SMTP |

Ferramentas de desenvolvimento: `prisma` (CLI e migrações), `typescript` (tipagem), `tsx` (execução de TypeScript) e pacotes `@types/*` (declarações de tipos).

O comando `start` também usa `tsx`, portanto a instalação atual exige dependências de desenvolvimento no ambiente de execução. Uma estratégia de compilação e implantação de produção ainda precisa ser definida.

Execute `npm audit` para consultar vulnerabilidades atuais e avalie cada atualização com testes. Um resultado antigo de auditoria não descreve necessariamente o estado da instalação atual.
