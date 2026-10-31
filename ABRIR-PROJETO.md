# Abrir o projeto para revisão

Este pacote contém o backend UniBus com rascunhos de viagens e carteira manual em desenvolvimento. Não contém credenciais, histórico Git, node_modules, cliente Prisma gerado ou cópia do banco. Nenhuma alteração da carteira foi commitada ou aplicada ao Neon.

1. Extraia o ZIP e abra a pasta UniBus-back-end no editor.
2. Instale Node.js 24 e tenha um PostgreSQL local vazio disponível. Execute `npm ci` nessa pasta.
3. Copie `.env.example` para `.env`. Configure DATABASE_URL para o PostgreSQL local e JWT_SECRET com pelo menos 32 caracteres aleatórios. Não use a conexão compartilhada do Neon nesta revisão.
4. Execute `npm run prisma:generate`, `npm run prisma:validate` e `npx prisma migrate deploy` para aplicar as migrações já existentes no banco local vazio.
5. Para preparar um operador e uma instituição fictícia local, configure no seu `.env`: SEED_OPERADOR_CPF (CPF válido de teste), SEED_OPERADOR_EMAIL e SEED_OPERADOR_SENHA (8 a 72 bytes, com maiúscula, minúscula, número e símbolo). Execute `npm run seed:local`. O script só aceita localhost/127.0.0.1/::1, não roda no Neon e não redefine senhas de cadastros existentes.
6. Execute `npm run dev`. A API responde na porta 3000. Faça login em POST /api/v1/auth/login com email e senha do operador.
7. Cadastre o estudante em POST /api/v1/estudantes. A unidade criada pelo seed tem ID `10000000-0000-4000-8000-000000000005`. Ative sua conta pelo endpoint de usuários antes de testar o login de estudante.
8. Use os contratos em docs/viagens.md, docs/usuarios.md e docs/carteira.md para testar pelo cliente HTTP de sua preferência. A rota fictícia local tem ID `10000000-0000-4000-8000-000000000006`.
9. Execute `npm run typecheck` e `npm test`. Os testes usam dados isolados e não se conectam ao DATABASE_URL do seu `.env`. É necessário permitir conexões HTTP locais para os testes.

O SMTP não é necessário para saldo ou recarga; configure o sandbox Mailtrap para testar recuperação de senha. Não há senha padrão pronta no pacote.

Se a instalação bloquear scripts de dependências, consulte o aviso do npm e habilite apenas os scripts necessários de Prisma, esbuild e bcrypt conforme sua política local. Não desabilite indiscriminadamente as proteções do gerenciador.

As notas da pasta notas-locais do pacote são referências de planejamento, não instruções de instalação nem indicação de que todos os fluxos já estejam implementados. Mantenha essa pasta fora do Git. Ao começar a editar a cópia extraída, evite trabalhar simultaneamente na cópia antiga; o ZIP não inclui o vínculo com o repositório remoto.
