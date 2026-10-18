## Leitura geral do schema

O schema possui **29 modelos** e **25 enums**, organizados naturalmente em alguns domínios:

1. **Identidade e autenticação**
   - `Usuario`
   - `TokenAcesso`
   - `Estudante`
   - `Motorista`
   - `ComprovanteMatricula`

2. **Instituições e pontos de parada**
   - `InstituicaoEnsino`
   - `UnidadeEnsino`
   - `PontoParada`

3. **Planejamento operacional**
   - `Rota`
   - `RotaParada`
   - `Veiculo`
   - `EscalaSemanal`

4. **Execução de viagens**
   - `Viagem`
   - `TrechoViagem`
   - `ParadaTrecho`
   - `AtendimentoTrecho`
   - `IndisponibilidadeMotorista`

5. **Reservas e participação dos estudantes**
   - `SolicitacaoReserva`
   - `ParticipacaoTrecho`
   - `AlteracaoParticipacao`
   - `AlteracaoAtendimento`

6. **Embarque e cobrança**
   - `Embarque`
   - `Carteira`
   - `Recarga`
   - `MovimentacaoCarteira`

7. **Comunicação**
   - `Aviso`
   - `DispositivoUsuario`
   - `Notificacao`
   - `EntregaNotificacao`

A estrutura atual contém apenas o Prisma, sem uma pasta de aplicação. Portanto, este é um bom momento para organizar o backend por **domínios funcionais**, e não por uma grande pasta global de `controllers`, `services` e `repositories`.

O modelo principal está em `schema.prisma`.

---

# Estrutura recomendada

Eu recomendaria uma arquitetura modular, com cada domínio contendo suas próprias rotas, casos de uso, validações e repositórios:

```text
UniBus-back-end/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
├── src/
│   ├── app.ts
│   ├── server.ts
│   │
│   ├── config/
│   │   ├── env.ts
│   │   ├── auth.ts
│   │   └── database.ts
│   │
│   ├── shared/
│   │   ├── errors/
│   │   │   ├── AppError.ts
│   │   │   └── errorHandler.ts
│   │   ├── http/
│   │   │   ├── middlewares/
│   │   │   │   ├── authMiddleware.ts
│   │   │   │   ├── roleMiddleware.ts
│   │   │   │   ├── validationMiddleware.ts
│   │   │   │   └── idempotencyMiddleware.ts
│   │   │   └── responses.ts
│   │   ├── database/
│   │   │   └── prisma.ts
│   │   ├── validators/
│   │   ├── utils/
│   │   └── types/
│   │       └── auth.ts
│   │
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── students/
│   │   ├── drivers/
│   │   ├── education/
│   │   ├── transport/
│   │   ├── trips/
│   │   ├── reservations/
│   │   ├── boarding/
│   │   ├── wallet/
│   │   └── notifications/
│   │
│   ├── jobs/
│   │   ├── notificationDelivery.job.ts
│   │   ├── tokenExpiration.job.ts
│   │   └── tripStatus.job.ts
│   │
│   └── routes/
│       └── index.ts
│
├── tests/
│   ├── integration/
│   └── unit/
│
├── package.json
└── tsconfig.json
```

A ideia principal é evitar que uma regra de negócio fique espalhada entre controller, service e repository sem pertencer claramente a um domínio.

---

# Estrutura interna dos módulos

Cada módulo pode seguir este padrão:

```text
modules/
└── trips/
    ├── trips.routes.ts
    ├── trips.controller.ts
    ├── trips.service.ts
    ├── trips.repository.ts
    ├── trips.schemas.ts
    ├── trips.types.ts
    └── use-cases/
        ├── create-trip.use-case.ts
        ├── publish-trip.use-case.ts
        ├── start-trip.use-case.ts
        ├── complete-trip.use-case.ts
        └── cancel-trip.use-case.ts
```

Para módulos mais complexos, como viagens e reservas, prefira casos de uso separados em vez de um `service.ts` muito grande.

---

# Rotas recomendadas

## 1. Autenticação

Relacionada a `Usuario` e `TokenAcesso`.

```text
POST   /api/v1/auth/login
POST   /api/v1/auth/activate-account
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/reset-password
POST   /api/v1/auth/verify-email
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
GET    /api/v1/auth/me
```

O `TokenAcesso` não deveria possuir CRUD público. Ele deve ser usado internamente pelos casos de uso de recuperação de senha e verificação de e-mail.

### Regras importantes

- Nunca retornar `senhaHash`.
- Nunca retornar o token original armazenado.
- Armazenar somente hash do token.
- Validar `expiraEm` e `utilizadoEm`.
- Invalidar ou marcar token como utilizado após consumo.

---

## 2. Usuários e perfis

Modelos envolvidos:

- `Usuario`
- `Estudante`
- `Motorista`
- `ComprovanteMatricula`

Rotas de usuário:

```text
GET    /api/v1/users
POST   /api/v1/users
GET    /api/v1/users/:id
PATCH  /api/v1/users/:id
PATCH  /api/v1/users/:id/status
PATCH  /api/v1/users/:id/password
```

Rotas do usuário autenticado:

```text
GET    /api/v1/me
PATCH  /api/v1/me
PATCH  /api/v1/me/password
```

Rotas de estudante:

```text
GET    /api/v1/students
POST   /api/v1/students
GET    /api/v1/students/:id
PATCH  /api/v1/students/:id
PATCH  /api/v1/students/:id/status
POST   /api/v1/students/:id/enrollment-proof
GET    /api/v1/students/:id/enrollment-proofs
```

Rotas de motorista:

```text
GET    /api/v1/drivers
POST   /api/v1/drivers
GET    /api/v1/drivers/:id
PATCH  /api/v1/drivers/:id
GET    /api/v1/drivers/:id/schedules
GET    /api/v1/drivers/:id/availability
```

`ComprovanteMatricula` também não precisa de CRUD completo. O comportamento mais adequado é upload, listagem e análise:

```text
POST   /api/v1/students/:studentId/enrollment-proofs
GET    /api/v1/students/:studentId/enrollment-proofs
PATCH  /api/v1/enrollment-proofs/:id/review
```

---

## 3. Instituições, unidades e pontos de parada

Modelos envolvidos:

- `InstituicaoEnsino`
- `UnidadeEnsino`
- `PontoParada`

Rotas:

```text
GET    /api/v1/educational-institutions
POST   /api/v1/educational-institutions
GET    /api/v1/educational-institutions/:id
PATCH  /api/v1/educational-institutions/:id
PATCH  /api/v1/educational-institutions/:id/status
```

```text
GET    /api/v1/educational-units
POST   /api/v1/educational-units
GET    /api/v1/educational-units/:id
PATCH  /api/v1/educational-units/:id
PATCH  /api/v1/educational-units/:id/status
```

```text
GET    /api/v1/stops
POST   /api/v1/stops
GET    /api/v1/stops/:id
PATCH  /api/v1/stops/:id
PATCH  /api/v1/stops/:id/status
```

Sugestão de filtros:

```text
GET /api/v1/stops?city=...&active=true
GET /api/v1/educational-units?institutionId=...
```

`PontoParada` tem relação com rotas e trechos, portanto sua exclusão física provavelmente não deve ser permitida. O ideal é utilizar `ativo`.

---

## 4. Rotas, veículos e escalas

Modelos envolvidos:

- `Rota`
- `RotaParada`
- `Veiculo`
- `EscalaSemanal`

### Rotas de transporte

```text
GET    /api/v1/routes
POST   /api/v1/routes
GET    /api/v1/routes/:id
PATCH  /api/v1/routes/:id
PATCH  /api/v1/routes/:id/status
```

Gerenciamento das paradas da rota:

```text
GET    /api/v1/routes/:routeId/stops
POST   /api/v1/routes/:routeId/stops
PATCH  /api/v1/routes/:routeId/stops/:routeStopId
DELETE /api/v1/routes/:routeId/stops/:routeStopId
PATCH  /api/v1/routes/:routeId/stops/reorder
```

`RotaParada` é uma entidade de associação com regra própria de ordenação. Não deve ser tratada apenas como uma tabela intermediária simples.

### Veículos

```text
GET    /api/v1/vehicles
POST   /api/v1/vehicles
GET    /api/v1/vehicles/:id
PATCH  /api/v1/vehicles/:id
PATCH  /api/v1/vehicles/:id/status
```

### Escalas

```text
GET    /api/v1/schedules
POST   /api/v1/schedules
GET    /api/v1/schedules/:id
PATCH  /api/v1/schedules/:id
PATCH  /api/v1/schedules/:id/status
```

Também podem existir endpoints contextualizados:

```text
GET /api/v1/routes/:routeId/schedules
GET /api/v1/drivers/:driverId/schedules
GET /api/v1/vehicles/:vehicleId/schedules
```

---

## 5. Viagens e trechos

Modelos envolvidos:

- `Viagem`
- `TrechoViagem`
- `ParadaTrecho`
- `AtendimentoTrecho`

Este é o núcleo operacional do sistema.

### Viagens

```text
GET    /api/v1/trips
POST   /api/v1/trips
GET    /api/v1/trips/:id
PATCH  /api/v1/trips/:id
POST   /api/v1/trips/:id/publish
POST   /api/v1/trips/:id/start
POST   /api/v1/trips/:id/complete
POST   /api/v1/trips/:id/cancel
```

Filtros importantes:

```text
GET /api/v1/trips?date=2026-10-18
GET /api/v1/trips?status=PROGRAMADA
GET /api/v1/trips?routeId=...
GET /api/v1/trips?shift=MANHA
```

### Trechos

```text
GET    /api/v1/trips/:tripId/segments
GET    /api/v1/segments/:id
POST   /api/v1/segments/:id/open
POST   /api/v1/segments/:id/start
POST   /api/v1/segments/:id/complete
POST   /api/v1/segments/:id/cancel
```

Cada `Viagem` pode ter no máximo um trecho de cada `SentidoTrecho`, conforme:

```prisma
@@unique([viagemId, sentido])
```

Logo, os endpoints devem respeitar os sentidos `IDA` e `VOLTA`.

### Paradas do trecho

```text
GET /api/v1/segments/:segmentId/stops
```

`ParadaTrecho` deve ser criada a partir de `PontoParada`, mas mantém uma cópia de informações como nome, cidade, endereço e referência. Isso indica que ela funciona como um **snapshot histórico da parada no contexto da viagem**.

Portanto, não é recomendado alterar automaticamente todas as `ParadaTrecho` quando um `PontoParada` for editado.

### Atendimentos

```text
GET    /api/v1/segments/:segmentId/attendances
POST   /api/v1/segments/:segmentId/attendances
GET    /api/v1/attendances/:id
PATCH  /api/v1/attendances/:id
POST   /api/v1/attendances/:id/cancel
```

`AlteracaoAtendimento` deve ser gerada automaticamente sempre que houver alteração relevante no atendimento. Não precisa de uma rota pública para criação manual.

---

## 6. Reservas e participações

Modelos envolvidos:

- `SolicitacaoReserva`
- `ParticipacaoTrecho`
- `AlteracaoParticipacao`

### Solicitações de reserva

```text
GET    /api/v1/reservation-requests
POST   /api/v1/segments/:segmentId/reservation-requests
GET    /api/v1/reservation-requests/:id
POST   /api/v1/reservation-requests/:id/approve
POST   /api/v1/reservation-requests/:id/cancel
```

Para o estudante:

```text
GET  /api/v1/me/reservation-requests
POST /api/v1/me/reservation-requests
```

### Participações

```text
GET    /api/v1/segments/:segmentId/participations
POST   /api/v1/segments/:segmentId/participations
GET    /api/v1/participations/:id
POST   /api/v1/participations/:id/cancel
PATCH  /api/v1/participations/:id/stops
```

Uma participação possui:

- estudante;
- trecho;
- origem;
- destino;
- atendimento opcional;
- posição global na fila;
- status.

A confirmação ou cancelamento deve ser feita por **casos de uso transacionais**, não por um simples `prisma.update`.

Exemplo:

```text
POST /api/v1/segments/:segmentId/participations
```

Esse caso de uso pode precisar:

1. Validar se o trecho aceita novas participações.
2. Validar se o estudante já possui participação no trecho.
3. Validar origem e destino.
4. Verificar disponibilidade.
5. Criar a participação.
6. Associar ou não a um atendimento.
7. Registrar `AlteracaoParticipacao`.
8. Criar uma notificação.
9. Executar tudo dentro de uma transação.

---

## 7. Embarques

Modelo envolvido:

- `Embarque`

Rotas:

```text
POST   /api/v1/boarding
GET    /api/v1/boarding/:id
GET    /api/v1/segments/:segmentId/boarding
POST   /api/v1/boarding/:id/reverse
```

Exemplo de payload:

```json
{
  "participacaoId": "uuid",
  "atendimentoId": "uuid",
  "motoristaId": "uuid",
  "veiculoId": "uuid",
  "semConfirmacaoPrevia": false,
  "chaveIdempotencia": "mobile-device-123-operation-456"
}
```

O campo `chaveIdempotencia` é obrigatório para evitar cobrança ou registro duplicado. Por isso, a rota de embarque deve:

- exigir uma chave de idempotência;
- verificar se a operação já foi processada;
- bloquear duplicidade;
- criar a cobrança da carteira na mesma transação;
- permitir estorno controlado.

O `Embarque` não deve ser um CRUD genérico.

---

## 8. Carteira, recarga e movimentações

Modelos envolvidos:

- `Carteira`
- `Recarga`
- `MovimentacaoCarteira`

### Carteira

```text
GET  /api/v1/me/wallet
GET  /api/v1/students/:studentId/wallet
GET  /api/v1/me/wallet/statement
```

### Recargas

```text
POST  /api/v1/me/wallet/top-ups
GET   /api/v1/me/wallet/top-ups
GET   /api/v1/top-ups/:id
POST  /api/v1/top-ups/:id/approve
POST  /api/v1/top-ups/:id/reject
POST  /api/v1/top-ups/:id/cancel
```

### Movimentações

```text
GET /api/v1/wallet-transactions
GET /api/v1/me/wallet/transactions
```

`MovimentacaoCarteira` deve ser tratada como um **livro financeiro**, preferencialmente somente de inclusão. Não é recomendado permitir edição ou exclusão.

Toda alteração de saldo deve respeitar:

- transação de banco;
- controle de concorrência usando `versao`;
- valores em centavos;
- chave de idempotência;
- registro do saldo após a operação;
- relação com `Recarga` ou `Embarque`.

A cobrança de embarque e a movimentação financeira devem ser criadas no mesmo caso de uso transacional.

---

## 9. Indisponibilidade do motorista

Modelo envolvido:

- `IndisponibilidadeMotorista`

Rotas:

```text
POST   /api/v1/attendances/:attendanceId/unavailability
GET    /api/v1/driver-unavailability
GET    /api/v1/driver-unavailability/:id
POST   /api/v1/driver-unavailability/:id/resolve
```

Quando uma indisponibilidade é resolvida, provavelmente será necessário:

1. Registrar a resolução.
2. Criar uma alteração de atendimento.
3. Reavaliar o motorista ou veículo.
4. Notificar operador e motorista.
5. Talvez realocar o atendimento.

Por isso, `POST /resolve` deve ser um caso de uso próprio.

---

## 10. Avisos e notificações

Modelos envolvidos:

- `Aviso`
- `DispositivoUsuario`
- `Notificacao`
- `EntregaNotificacao`

### Avisos

```text
GET    /api/v1/announcements
POST   /api/v1/announcements
GET    /api/v1/announcements/:id
PATCH  /api/v1/announcements/:id
POST   /api/v1/announcements/:id/publish
```

### Notificações do usuário

```text
GET   /api/v1/me/notifications
GET   /api/v1/me/notifications/unread-count
POST  /api/v1/me/notifications/:id/read
POST  /api/v1/me/notifications/read-all
```

### Dispositivos

```text
POST   /api/v1/me/devices
GET    /api/v1/me/devices
PATCH  /api/v1/me/devices/:id
DELETE /api/v1/me/devices/:id
```

### Entrega

`EntregaNotificacao` deve ser tratada internamente por worker/job:

```text
jobs/notificationDelivery.job.ts
```

Não deve existir uma rota pública permitindo alterar livremente `status`, `tentativas` ou `ultimoErro`.

---

# Organização detalhada dos módulos

```text
src/modules/
├── auth/
│   ├── auth.routes.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── auth.repository.ts
│   ├── auth.schemas.ts
│   └── use-cases/
│       ├── login.use-case.ts
│       ├── activate-account.use-case.ts
│       ├── request-password-recovery.use-case.ts
│       ├── reset-password.use-case.ts
│       └── verify-email.use-case.ts
│
├── users/
│   ├── users.routes.ts
│   ├── users.controller.ts
│   ├── users.repository.ts
│   ├── users.schemas.ts
│   └── use-cases/
│
├── students/
│   ├── students.routes.ts
│   ├── students.controller.ts
│   ├── students.repository.ts
│   ├── enrollment-proof.service.ts
│   └── use-cases/
│
├── drivers/
│   ├── drivers.routes.ts
│   ├── drivers.controller.ts
│   ├── drivers.repository.ts
│   └── use-cases/
│
├── education/
│   ├── institutions/
│   ├── units/
│   └── stops/
│
├── transport/
│   ├── routes/
│   ├── vehicles/
│   └── schedules/
│
├── trips/
│   ├── trips.routes.ts
│   ├── trips.controller.ts
│   ├── trips.repository.ts
│   ├── trips.schemas.ts
│   ├── segments/
│   ├── attendances/
│   ├── trip-stops/
│   └── use-cases/
│
├── reservations/
│   ├── reservations.routes.ts
│   ├── reservations.controller.ts
│   ├── reservations.repository.ts
│   └── use-cases/
│
├── boarding/
│   ├── boarding.routes.ts
│   ├── boarding.controller.ts
│   ├── boarding.repository.ts
│   └── use-cases/
│
├── wallet/
│   ├── wallet.routes.ts
│   ├── wallet.controller.ts
│   ├── wallet.repository.ts
│   ├── ledger.service.ts
│   └── use-cases/
│
└── notifications/
    ├── announcements/
    ├── notifications/
    ├── devices/
    └── delivery/
```

---

# O que não deve virar CRUD público

Alguns modelos são principalmente internos ou de auditoria:

| Modelo | Tratamento recomendado |
|---|---|
| `TokenAcesso` | Criado e consumido por fluxos de autenticação |
| `RotaParada` | Gerenciado por rotas específicas da rota |
| `ParadaTrecho` | Criado durante a composição do trecho |
| `AlteracaoAtendimento` | Gerado automaticamente como auditoria |
| `AlteracaoParticipacao` | Gerado automaticamente como auditoria |
| `MovimentacaoCarteira` | Ledger financeiro, sem edição/exclusão |
| `EntregaNotificacao` | Gerenciada por worker |
| `Embarque` | Operação de negócio, não CRUD |
| `TrechoViagem` | Transições de estado explícitas |
| `AtendimentoTrecho` | Alocação operacional, com regras próprias |

---

# Estados que devem ser implementados como máquinas de estado

O schema possui diversos enums de status. O ideal é evitar que qualquer rota possa alterar o status livremente.

## `StatusViagem`

```text
RASCUNHO
  -> PROGRAMADA
  -> CANCELADA

PROGRAMADA
  -> EM_ANDAMENTO
  -> CANCELADA

EM_ANDAMENTO
  -> CONCLUIDA
  -> CANCELADA
```

## `StatusTrecho`

```text
RASCUNHO
  -> ABERTO
  -> CANCELADO

ABERTO
  -> EM_ANDAMENTO
  -> FECHADO
  -> CANCELADO

EM_ANDAMENTO
  -> CONCLUIDO
  -> CANCELADO
```

## `StatusCadastroEstudante`

```text
PENDENTE -> APROVADO
PENDENTE -> REJEITADO
APROVADO -> SUSPENSO
SUSPENSO -> APROVADO
```

## `StatusRecarga`

```text
PENDENTE -> APROVADA
PENDENTE -> REJEITADA
PENDENTE -> CANCELADA
```

Essas transições deveriam ficar em arquivos específicos:

```text
src/modules/trips/domain/trip-status.ts
src/modules/trips/domain/segment-status.ts
src/modules/students/domain/student-status.ts
src/modules/wallet/domain/top-up-status.ts
```

---

# Permissões por perfil

Os enums `PerfilUsuario` indicam três atores:

```text
ESTUDANTE
MOTORISTA
OPERADOR
```

Uma divisão inicial seria:

| Área | Estudante | Motorista | Operador |
|---|---:|---:|---:|
| Consultar viagens | Sim | Sim | Sim |
| Criar reserva | Sim | Não | Sim |
| Cancelar própria reserva | Sim | Não | Sim |
| Registrar embarque | Não | Sim | Sim |
| Gerenciar veículos | Não | Não | Sim |
| Gerenciar rotas | Não | Não | Sim |
| Aprovar cadastro | Não | Não | Sim |
| Aprovar recarga | Não | Não | Sim |
| Resolver indisponibilidade | Não | Não | Sim |
| Consultar carteira própria | Sim | Não | Sim |
| Publicar avisos | Não | Não | Sim |

A autorização deve ser aplicada na rota e também validada no caso de uso. Não dependa somente do middleware.

---

# Regras importantes extraídas do schema

## 1. Não expor os modelos diretamente nas rotas

O schema contém relações e restrições suficientes para indicar regras de negócio importantes. O controller não deveria executar operações Prisma complexas diretamente.

Exemplo ruim:

```ts
await prisma.participacaoTrecho.create({
  data: req.body
});
```

Melhor:

```ts
await createParticipationUseCase.execute({
  studentId: user.id,
  segmentId: req.params.segmentId,
  originId: input.originId,
  destinationId: input.destinationId
});
```

---

## 2. Usar transações nas operações compostas

As seguintes operações devem usar `prisma.$transaction`:

- confirmar participação;
- cancelar participação;
- publicar ou iniciar viagem;
- registrar embarque;
- estornar embarque;
- aprovar recarga;
- movimentar saldo;
- resolver indisponibilidade;
- realocar atendimento.

---

## 3. Valores financeiros sempre em centavos

Os campos:

```text
tarifaCentavos
saldoCentavos
limiteCreditoCentavos
valorCentavos
saldoAposCentavos
```

devem permanecer como `Int`. A API pode receber e retornar valores em centavos ou utilizar DTOs explícitos para conversão, mas nunca deve usar `float` para operações financeiras.

---

## 4. Exclusão lógica

Vários modelos possuem campos de ativação:

```text
Usuario.status
InstituicaoEnsino.ativa
UnidadeEnsino.ativa
PontoParada.ativo
Rota.ativa
Veiculo.ativo
EscalaSemanal.ativa
```

Assim, a aplicação deve priorizar:

```text
PATCH /resource/:id/status
```

em vez de:

```text
DELETE /resource/:id
```

O `onDelete: Restrict` reforça que o banco não quer permitir remoção de registros relacionados.

---

## 5. Auditoria

As alterações relevantes devem criar registros em:

- `AlteracaoParticipacao`
- `AlteracaoAtendimento`
- `MovimentacaoCarteira`

A auditoria deve ser automática e conter:

- usuário responsável;
- motivo;
- dados anteriores;
- dados novos;
- ação executada.

---

# Exemplo de roteamento principal

```ts
// src/routes/index.ts

router.use("/api/v1/auth", authRoutes);
router.use("/api/v1/users", authMiddleware, usersRoutes);
router.use("/api/v1/students", authMiddleware, studentsRoutes);
router.use("/api/v1/drivers", authMiddleware, driversRoutes);

router.use("/api/v1/educational-institutions", authMiddleware, institutionRoutes);
router.use("/api/v1/educational-units", authMiddleware, unitRoutes);
router.use("/api/v1/stops", authMiddleware, stopRoutes);

router.use("/api/v1/routes", authMiddleware, routeRoutes);
router.use("/api/v1/vehicles", authMiddleware, vehicleRoutes);
router.use("/api/v1/schedules", authMiddleware, scheduleRoutes);

router.use("/api/v1/trips", authMiddleware, tripRoutes);
router.use("/api/v1/segments", authMiddleware, segmentRoutes);
router.use("/api/v1/reservation-requests", authMiddleware, reservationRoutes);
router.use("/api/v1/participations", authMiddleware, participationRoutes);

router.use("/api/v1/boarding", authMiddleware, boardingRoutes);
router.use("/api/v1/wallet", authMiddleware, walletRoutes);
router.use("/api/v1/top-ups", authMiddleware, topUpRoutes);

router.use("/api/v1/announcements", authMiddleware, announcementRoutes);
router.use("/api/v1/notifications", authMiddleware, notificationRoutes);
router.use("/api/v1/devices", authMiddleware, deviceRoutes);
```

---

# Recomendações adicionais

1. Usar prefixo de versão:
   ```text
   /api/v1
   ```

2. Usar nomes de recursos no plural:
   ```text
   /trips
   /students
   /vehicles
   ```

3. Reservar ações apenas para transições de negócio:
   ```text
   POST /trips/:id/start
   POST /trips/:id/cancel
   POST /top-ups/:id/approve
   ```

4. Usar paginação em todas as listagens:
   ```text
   ?page=1&limit=20
   ```

5. Padronizar respostas:
   ```json
   {
     "data": {},
     "meta": {
       "page": 1,
       "limit": 20,
       "total": 100
     }
   }
   ```

6. Validar entrada com Zod, Valibot ou biblioteca semelhante.

7. Criar índices adicionais após observar as consultas mais frequentes, especialmente para:
   - viagens por data e status;
   - trechos por status e horário;
   - notificações por usuário;
   - solicitações de reserva por status;
   - movimentações por carteira e data.

8. Considerar adicionar restrições de unicidade caso a regra de negócio exija:
   - `Estudante.matricula`;
   - combinação de `numeroCnh` com dados da instituição emissora, caso aplicável;
   - regras específicas para motorista e veículo em uma mesma escala.

## Resumo da recomendação

A melhor estrutura para esse schema é:

- **módulos por domínio funcional**;
- **rotas REST agrupadas por contexto**;
- **casos de uso para operações com regras de negócio**;
- **CRUD apenas para cadastros simples**;
- **transições explícitas para status**;
- **transações para reservas, embarques e carteira**;
- **auditoria automática**;
- **jobs para notificações e expiração de tokens**;
- **nenhuma exposição direta dos modelos internos do Prisma**.