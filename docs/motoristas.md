# Cadastro de motoristas

Base `/api/v1/motoristas`. Todas as rotas exigem autenticação e operador ativo. Não há exclusão física pela API.

| Método | Caminho | Finalidade |
| --- | --- | --- |
| POST | `/` | Criar conta e motorista juntos |
| POST | `/usuarios/:usuarioId` | Completar uma conta MOTORISTA existente |
| GET | `/` | Listar com paginação e filtros nome/status |
| GET | `/:id` | Consultar pelo ID do motorista |
| PATCH | `/:id` | Corrigir dados da CNH com motivo |

O cadastro completo recebe nome, cpf, email, telefone, senha, dataNascimento opcional, numeroCnh, categoriaCnh e validadeCnh. Não recebe perfil nem status: a conta nasce MOTORISTA e ATIVA, conforme a decisão de cadastro presencial pelo operador. A senha segue as validações do cadastro de usuários e é armazenada como hash. O cadastro genérico de usuários não cria mais contas MOTORISTA: retorna 409 indicando esta rota.

A CNH recebe 11 dígitos, categoria D ou E conforme a regra operacional atual, e validade como data YYYY-MM-DD. O cadastro não consulta órgãos externos nem certifica a autenticidade do documento. Uma CNH vencida pode ser registrada para correção administrativa; publicação, alocação e início continuam exigindo validade compatível com a viagem.

O complemento recebe apenas os dados da CNH e motivo. Exige conta MOTORISTA sem registro operacional e preserva status, senha e identidade existentes, inclusive bloqueios. Repetir o complemento retorna 409. CPF, e-mail, CNH e vínculo de conta duplicados não deixam registros parciais.

PATCH aceita numeroCnh, categoriaCnh e/ou validadeCnh e exige motivo de 3 a 1000 caracteres. Correções de nome, telefone, e-mail e nascimento continuam disponíveis nas rotas de perfil. A auditoria de cadastro, complemento e edição utiliza AlteracaoPerfil, com autor, data e estados anterior/novo, sem senha ou CPF. Não há nova migração nesta etapa.

Listagem aceita pagina (padrão 1), limite (padrão 20, máximo 100), nome e status. Retorna dados e meta.temProxima. As respostas administrativas contêm dados da CNH e contatos, sem CPF, hash ou dados financeiros. O acesso fica restrito ao operador.

## Status e vínculos

`PATCH /api/v1/usuarios/:usuarioId/status` recebe status e motivo obrigatório quando o alvo é motorista. ATIVA, BLOQUEADA e INATIVA continuam sendo os estados administrativos disponíveis. Qualquer alteração de status do motorista é auditada na mesma transação.

Bloquear ou desativar exige resolver os vínculos de motorista normal ou extra com trechos ABERTO, FECHADO ou EM_ANDAMENTO. O operador deve substituir o motorista ou encerrar/cancelar o trecho. Rascunhos e históricos concluídos/cancelados não impedem a desativação; rascunhos precisarão de motorista ativo para publicação. Nenhuma dessas ações apaga a CNH, os embarques ou os registros anteriores.

A auditoria e o motivo obrigatório para alteração de status também se aplicam aos demais perfis. O impedimento por vínculo como motorista normal ou extra permanece específico dos motoristas.
