# Meus dados

Base: `/api/v1`. Todas as rotas exigem `Authorization: Bearer {{token}}`.

O estudante consulta seus dados e pode editar somente nome e telefone em PATCH /usuarios/me, com corpo estrito e sem motivo obrigatório. E-mail, nascimento, dados acadêmicos e foto continuam sob correção exclusiva de operador ativo, com motivo e auditoria. Preferências de viagens continuam sendo editadas pelo próprio usuário nas rotas de preferências.

## Consulta

`GET /usuarios/me` retorna nome, e-mail, telefone, nascimento (`YYYY-MM-DD` ou `null`), `fotoUrl` e o objeto `estudante`, com curso, cidade de origem e unidade/instituição de ensino. Contas sem cadastro acadêmico recebem `estudante: null`.

`GET /estudantes/me` mantém o contrato acadêmico e também retorna curso, cidade de origem e nascimento/foto dentro de `usuario`.

Não são retornados CPF, hash de senha nem chave do arquivo. Dados novos são opcionais para compatibilidade com os cadastros existentes; o front deve exibir uma indicação de dado não informado quando receber `null`.

## Correção pelo operador

`PATCH /usuarios/{{usuarioId}}/dados` — o ID é o do **usuário**, não o do estudante. Envie apenas os campos que deseja corrigir e um motivo de 3 a 1000 caracteres:

```json
{
  "nome": "Maria da Silva",
  "email": "maria@example.com",
  "telefone": "53999999999",
  "dataNascimento": "2004-03-20",
  "estudante": {
    "curso": "Ciência da Computação",
    "cidadeOrigemId": "UUID_REAL_DA_CIDADE",
    "unidadeEnsinoId": "UUID_REAL_DA_UNIDADE"
  },
  "motivo": "Correção cadastral solicitada pela estudante"
}
```

Nascimento, curso e cidade podem ser removidos enviando `null`. Unidade de ensino não pode ser removida. A unidade, sua instituição e seu ponto de parada precisam estar ativos; a cidade também precisa estar ativa ao ser selecionada. Universidade é obtida pela unidade de ensino, evitando dois vínculos contraditórios. A cidade de origem não é a lista de cidades favoritas.

Permite corrigir os campos acima em estudantes aprovados. Não muda matrícula, aprovação, perfil, CPF, senha ou saldo. Os campos não previstos são rejeitados. `PATCH /usuarios/me` aceita apenas nome e telefone do próprio usuário. Para corrigir os demais dados próprios, o operador utiliza `/usuarios/:id/dados`, informando seu ID e o motivo.

Uma mudança real de e-mail remove a marca de e-mail verificado e invalida tokens de ativação/recuperação ainda não utilizados. Não altera a senha nem revoga JWTs já emitidos.

A correção e o registro de auditoria em `AlteracaoPerfil` pertencem à mesma transação. A auditoria registra autor, alvo, motivo e valores anteriores/novos, sem CPF e sem credenciais. Como contém dados pessoais, seu acesso e retenção devem ser controlados pelo administrador do banco; não há rota pública de consulta ou edição da auditoria.

## Foto

- `PUT /usuarios/{{usuarioId}}/foto`: somente operador. No Bruno, Body → Multipart Form, campo de arquivo `foto` e campo de texto `motivo`. Não configure manualmente Content-Type; o cliente precisa incluir o boundary.
- `DELETE /usuarios/{{usuarioId}}/foto`: somente operador, JSON `{"motivo":"Remoção solicitada pela estudante"}`.
- `GET /usuarios/me/foto`: foto do usuário autenticado.
- `GET /usuarios/{{usuarioId}}/foto`: somente o próprio usuário ou operador.

Aceita JPEG/PNG reais até 5 MB e 16 megapixels. O servidor decodifica a imagem e salva JPEG de até 512 × 512, sem os metadados originais. O arquivo fica em armazenamento privado e a consulta usa autenticação, inclusive ao utilizar `fotoUrl`. No front, use fetch autenticado e uma URL de objeto para exibir a imagem. Uma tag de imagem com a URL sozinha não envia o token Bearer.

`FOTOS_DIR` configura a pasta (padrão `.private/fotos`), fora de diretórios públicos. Produção precisa de volume persistente, cópias de segurança e permissões restritas. A remoção do arquivo antigo ocorre após o commit. Falhas de remoção geram log genérico e podem exigir limpeza de arquivos órfãos.

## Cadastro e migração

`POST /estudantes` também aceita `dataNascimento`, `curso` e `cidadeOrigemId` opcionais, além do cadastro unificado existente. `POST /usuarios` aceita nascimento para operadores e motoristas.

Antes de usar os campos, aplique a migração `20261031000300_meus_dados` no banco correto, após a migração de preferências. Ela adiciona colunas opcionais e auditoria, preservando os registros existentes. As migrações não são aplicadas automaticamente pelo servidor.

## Respostas a testar

Consulta/correção válida: 200. Sem autenticação: 401. Tentativa de correção administrativa por estudante/motorista ou leitura de foto alheia: 403. Autoedição com campos além de nome/telefone: 400. Campos inválidos, motivo ausente ou nascimento futuro: 400. Usuário/foto inexistente: 404. E-mail ou matrícula em conflito: 409, com rollback completo. Foto grande: 413. Formato de foto não suportado: 415.
