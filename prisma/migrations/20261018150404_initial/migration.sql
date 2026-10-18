-- CreateEnum
CREATE TYPE "PerfilUsuario" AS ENUM ('ESTUDANTE', 'MOTORISTA', 'OPERADOR');

-- CreateEnum
CREATE TYPE "StatusConta" AS ENUM ('AGUARDANDO_ATIVACAO', 'ATIVA', 'BLOQUEADA', 'INATIVA');

-- CreateEnum
CREATE TYPE "StatusCadastroEstudante" AS ENUM ('PENDENTE', 'APROVADO', 'REJEITADO', 'SUSPENSO');

-- CreateEnum
CREATE TYPE "TipoInstituicao" AS ENUM ('FACULDADE', 'TECNICA', 'PREPARATORIA');

-- CreateEnum
CREATE TYPE "TipoVeiculo" AS ENUM ('ONIBUS', 'VAN');

-- CreateEnum
CREATE TYPE "Turno" AS ENUM ('MANHA', 'TARDE', 'NOITE');

-- CreateEnum
CREATE TYPE "DiaSemana" AS ENUM ('SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA');

-- CreateEnum
CREATE TYPE "StatusViagem" AS ENUM ('RASCUNHO', 'PROGRAMADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "SentidoTrecho" AS ENUM ('IDA', 'VOLTA');

-- CreateEnum
CREATE TYPE "StatusTrecho" AS ENUM ('RASCUNHO', 'ABERTO', 'FECHADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoAtendimento" AS ENUM ('PRINCIPAL', 'RESERVA');

-- CreateEnum
CREATE TYPE "StatusAtendimento" AS ENUM ('CONFIRMADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusParticipacao" AS ENUM ('CONFIRMADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusSolicitacaoReserva" AS ENUM ('PENDENTE', 'ATENDIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusEmbarque" AS ENUM ('REGISTRADO', 'ESTORNADO');

-- CreateEnum
CREATE TYPE "FormaPagamento" AS ENUM ('PIX', 'DINHEIRO');

-- CreateEnum
CREATE TYPE "StatusRecarga" AS ENUM ('PENDENTE', 'APROVADA', 'REJEITADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoMovimentacao" AS ENUM ('RECARGA', 'COBRANCA_EMBARQUE', 'ESTORNO');

-- CreateEnum
CREATE TYPE "StatusIndisponibilidade" AS ENUM ('PENDENTE', 'RESOLVIDA');

-- CreateEnum
CREATE TYPE "TipoTokenAcesso" AS ENUM ('RECUPERACAO_SENHA', 'VERIFICACAO_EMAIL');

-- CreateEnum
CREATE TYPE "CanalNotificacao" AS ENUM ('PAINEL', 'PUSH', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "StatusEntrega" AS ENUM ('PENDENTE', 'PROCESSANDO', 'ENVIADA', 'FALHOU', 'CANCELADA');

-- CreateEnum
CREATE TYPE "AcaoParticipacao" AS ENUM ('CONFIRMACAO', 'CANCELAMENTO', 'ALTERACAO_PONTOS', 'ALOCACAO', 'TROCA_VEICULO', 'INCLUSAO_EXCEPCIONAL');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" VARCHAR(11) NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "senhaHash" TEXT,
    "deveAlterarSenha" BOOLEAN NOT NULL DEFAULT true,
    "senhaTemporariaExpiraEm" TIMESTAMPTZ(3),
    "perfil" "PerfilUsuario" NOT NULL,
    "status" "StatusConta" NOT NULL DEFAULT 'AGUARDANDO_ATIVACAO',
    "emailVerificadoEm" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "cadastradoPorId" UUID,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenAcesso" (
    "id" UUID NOT NULL,
    "tipo" "TipoTokenAcesso" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMPTZ(3) NOT NULL,
    "utilizadoEm" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "usuarioId" UUID NOT NULL,

    CONSTRAINT "TokenAcesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estudante" (
    "id" UUID NOT NULL,
    "matricula" TEXT NOT NULL,
    "previsaoConclusao" DATE NOT NULL,
    "statusCadastro" "StatusCadastroEstudante" NOT NULL DEFAULT 'PENDENTE',
    "analisadoEm" TIMESTAMPTZ(3),
    "observacaoAnalise" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "usuarioId" UUID NOT NULL,
    "unidadeEnsinoId" UUID NOT NULL,
    "analisadoPorId" UUID,

    CONSTRAINT "Estudante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Motorista" (
    "id" UUID NOT NULL,
    "numeroCnh" VARCHAR(11) NOT NULL,
    "categoriaCnh" VARCHAR(2) NOT NULL,
    "validadeCnh" DATE NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "usuarioId" UUID NOT NULL,

    CONSTRAINT "Motorista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComprovanteMatricula" (
    "id" UUID NOT NULL,
    "chaveArquivo" TEXT NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "estudanteId" UUID NOT NULL,
    "enviadoPorId" UUID NOT NULL,

    CONSTRAINT "ComprovanteMatricula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstituicaoEnsino" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoInstituicao" NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InstituicaoEnsino_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnidadeEnsino" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "endereco" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "instituicaoEnsinoId" UUID NOT NULL,
    "pontoParadaId" UUID NOT NULL,

    CONSTRAINT "UnidadeEnsino_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PontoParada" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "endereco" TEXT,
    "referencia" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PontoParada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rota" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Rota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RotaParada" (
    "id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "rotaId" UUID NOT NULL,
    "pontoParadaId" UUID NOT NULL,

    CONSTRAINT "RotaParada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Veiculo" (
    "id" UUID NOT NULL,
    "identificacao" TEXT NOT NULL,
    "placa" VARCHAR(7) NOT NULL,
    "tipo" "TipoVeiculo" NOT NULL,
    "capacidade" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Veiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalaSemanal" (
    "id" UUID NOT NULL,
    "diaSemana" "DiaSemana" NOT NULL,
    "turno" "Turno" NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "saidaIdaMinuto" INTEGER,
    "saidaVoltaMinuto" INTEGER,
    "chegadaPedroMinuto" INTEGER,
    "saidaVoltaDiaOffset" INTEGER NOT NULL DEFAULT 0,
    "chegadaPedroDiaOffset" INTEGER NOT NULL DEFAULT 0,
    "antecedenciaConfirmacaoIdaMin" INTEGER,
    "antecedenciaCancelamentoIdaMin" INTEGER,
    "antecedenciaConfirmacaoVoltaMin" INTEGER,
    "antecedenciaCancelamentoVoltaMin" INTEGER,
    "percentualVagasLivresReserva" INTEGER NOT NULL DEFAULT 10,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "rotaId" UUID NOT NULL,
    "motoristaId" UUID NOT NULL,
    "veiculoId" UUID NOT NULL,

    CONSTRAINT "EscalaSemanal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Viagem" (
    "id" UUID NOT NULL,
    "data" DATE NOT NULL,
    "turno" "Turno" NOT NULL,
    "nomeRota" TEXT NOT NULL,
    "status" "StatusViagem" NOT NULL DEFAULT 'RASCUNHO',
    "chegadaPedroPrevistaEm" TIMESTAMPTZ(3),
    "canceladaEm" TIMESTAMPTZ(3),
    "motivoCancelamento" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "rotaId" UUID NOT NULL,
    "escalaSemanalId" UUID,
    "criadaPorId" UUID NOT NULL,
    "canceladaPorId" UUID,

    CONSTRAINT "Viagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrechoViagem" (
    "id" UUID NOT NULL,
    "sentido" "SentidoTrecho" NOT NULL,
    "status" "StatusTrecho" NOT NULL DEFAULT 'RASCUNHO',
    "saidaPrevistaEm" TIMESTAMPTZ(3),
    "limiteConfirmacaoEm" TIMESTAMPTZ(3),
    "limiteCancelamentoEm" TIMESTAMPTZ(3),
    "iniciadoEm" TIMESTAMPTZ(3),
    "concluidoEm" TIMESTAMPTZ(3),
    "tarifaCentavos" INTEGER NOT NULL DEFAULT 200,
    "percentualVagasLivresReserva" INTEGER NOT NULL DEFAULT 10,
    "canceladoEm" TIMESTAMPTZ(3),
    "motivoCancelamento" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "viagemId" UUID NOT NULL,
    "canceladoPorId" UUID,

    CONSTRAINT "TrechoViagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParadaTrecho" (
    "id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "endereco" TEXT,
    "referencia" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "trechoId" UUID NOT NULL,
    "pontoParadaId" UUID NOT NULL,

    CONSTRAINT "ParadaTrecho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtendimentoTrecho" (
    "id" UUID NOT NULL,
    "tipo" "TipoAtendimento" NOT NULL,
    "status" "StatusAtendimento" NOT NULL DEFAULT 'CONFIRMADO',
    "prioridade" INTEGER NOT NULL,
    "capacidade" INTEGER NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "trechoId" UUID NOT NULL,
    "veiculoId" UUID NOT NULL,
    "motoristaId" UUID NOT NULL,
    "solicitacaoReservaId" UUID,

    CONSTRAINT "AtendimentoTrecho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlteracaoAtendimento" (
    "id" UUID NOT NULL,
    "motivo" TEXT NOT NULL,
    "dadosAnteriores" JSONB NOT NULL,
    "dadosNovos" JSONB NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "atendimentoId" UUID NOT NULL,
    "realizadaPorId" UUID NOT NULL,

    CONSTRAINT "AlteracaoAtendimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitacaoReserva" (
    "id" UUID NOT NULL,
    "status" "StatusSolicitacaoReserva" NOT NULL DEFAULT 'PENDENTE',
    "observacao" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "trechoId" UUID NOT NULL,
    "solicitadaPorId" UUID NOT NULL,

    CONSTRAINT "SolicitacaoReserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipacaoTrecho" (
    "id" UUID NOT NULL,
    "status" "StatusParticipacao" NOT NULL DEFAULT 'CONFIRMADA',
    "confirmadaEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceladaEm" TIMESTAMPTZ(3),
    "ordemFila" BIGSERIAL NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "trechoId" UUID NOT NULL,
    "estudanteId" UUID NOT NULL,
    "origemId" UUID NOT NULL,
    "destinoId" UUID NOT NULL,
    "atendimentoId" UUID,

    CONSTRAINT "ParticipacaoTrecho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlteracaoParticipacao" (
    "id" UUID NOT NULL,
    "acao" "AcaoParticipacao" NOT NULL,
    "motivo" TEXT,
    "dadosAnteriores" JSONB,
    "dadosNovos" JSONB,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "participacaoId" UUID NOT NULL,
    "realizadaPorId" UUID,

    CONSTRAINT "AlteracaoParticipacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Embarque" (
    "id" UUID NOT NULL,
    "status" "StatusEmbarque" NOT NULL DEFAULT 'REGISTRADO',
    "semConfirmacaoPrevia" BOOLEAN NOT NULL DEFAULT false,
    "autorizouSaldoNegativo" BOOLEAN NOT NULL DEFAULT false,
    "motivoLiberacao" TEXT,
    "registradoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estornadoEm" TIMESTAMPTZ(3),
    "motivoEstorno" TEXT,
    "chaveIdempotencia" TEXT NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "participacaoId" UUID NOT NULL,
    "atendimentoId" UUID NOT NULL,
    "registradoPorId" UUID NOT NULL,
    "estornadoPorId" UUID,
    "motoristaId" UUID NOT NULL,
    "veiculoId" UUID NOT NULL,

    CONSTRAINT "Embarque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Carteira" (
    "id" UUID NOT NULL,
    "saldoCentavos" INTEGER NOT NULL DEFAULT 0,
    "limiteCreditoCentavos" INTEGER NOT NULL DEFAULT 2000,
    "versao" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "estudanteId" UUID NOT NULL,

    CONSTRAINT "Carteira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recarga" (
    "id" UUID NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "formaPagamento" "FormaPagamento" NOT NULL,
    "status" "StatusRecarga" NOT NULL DEFAULT 'PENDENTE',
    "analisadaEm" TIMESTAMPTZ(3),
    "observacaoAnalise" TEXT,
    "identificadorPagamento" TEXT,
    "chaveIdempotencia" TEXT NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "carteiraId" UUID NOT NULL,
    "analisadaPorId" UUID,

    CONSTRAINT "Recarga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentacaoCarteira" (
    "id" UUID NOT NULL,
    "tipo" "TipoMovimentacao" NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "saldoAposCentavos" INTEGER NOT NULL,
    "chaveIdempotencia" TEXT NOT NULL,
    "motivo" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "carteiraId" UUID NOT NULL,
    "recargaId" UUID,
    "embarqueId" UUID,
    "movimentacaoOriginalId" UUID,
    "realizadaPorId" UUID NOT NULL,

    CONSTRAINT "MovimentacaoCarteira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndisponibilidadeMotorista" (
    "id" UUID NOT NULL,
    "motivo" TEXT NOT NULL,
    "status" "StatusIndisponibilidade" NOT NULL DEFAULT 'PENDENTE',
    "resolucao" TEXT,
    "resolvidaEm" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "atendimentoId" UUID NOT NULL,
    "motoristaId" UUID NOT NULL,
    "resolvidaPorId" UUID,

    CONSTRAINT "IndisponibilidadeMotorista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aviso" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "publicoPerfil" "PerfilUsuario",
    "publicadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "publicadoPorId" UUID NOT NULL,

    CONSTRAINT "Aviso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispositivoUsuario" (
    "id" UUID NOT NULL,
    "expoPushToken" TEXT NOT NULL,
    "plataforma" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "usuarioId" UUID NOT NULL,

    CONSTRAINT "DispositivoUsuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacao" (
    "id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "dados" JSONB,
    "chaveDeduplicacao" TEXT NOT NULL,
    "lidaEm" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "usuarioId" UUID NOT NULL,
    "avisoId" UUID,

    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntregaNotificacao" (
    "id" UUID NOT NULL,
    "canal" "CanalNotificacao" NOT NULL,
    "status" "StatusEntrega" NOT NULL DEFAULT 'PENDENTE',
    "destino" TEXT NOT NULL,
    "chaveDeduplicacao" TEXT NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "proximaTentativaEm" TIMESTAMPTZ(3),
    "processandoDesdeEm" TIMESTAMPTZ(3),
    "identificadorProvedor" TEXT,
    "ultimoErro" TEXT,
    "agendadaPara" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadaEm" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "notificacaoId" UUID NOT NULL,
    "dispositivoId" UUID,

    CONSTRAINT "EntregaNotificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_cpf_key" ON "Usuario"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_cadastradoPorId_idx" ON "Usuario"("cadastradoPorId");

-- CreateIndex
CREATE UNIQUE INDEX "TokenAcesso_tokenHash_key" ON "TokenAcesso"("tokenHash");

-- CreateIndex
CREATE INDEX "TokenAcesso_usuarioId_idx" ON "TokenAcesso"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Estudante_usuarioId_key" ON "Estudante"("usuarioId");

-- CreateIndex
CREATE INDEX "Estudante_statusCadastro_idx" ON "Estudante"("statusCadastro");

-- CreateIndex
CREATE INDEX "Estudante_unidadeEnsinoId_idx" ON "Estudante"("unidadeEnsinoId");

-- CreateIndex
CREATE INDEX "Estudante_analisadoPorId_idx" ON "Estudante"("analisadoPorId");

-- CreateIndex
CREATE UNIQUE INDEX "Motorista_numeroCnh_key" ON "Motorista"("numeroCnh");

-- CreateIndex
CREATE UNIQUE INDEX "Motorista_usuarioId_key" ON "Motorista"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "ComprovanteMatricula_chaveArquivo_key" ON "ComprovanteMatricula"("chaveArquivo");

-- CreateIndex
CREATE INDEX "ComprovanteMatricula_estudanteId_idx" ON "ComprovanteMatricula"("estudanteId");

-- CreateIndex
CREATE INDEX "ComprovanteMatricula_enviadoPorId_idx" ON "ComprovanteMatricula"("enviadoPorId");

-- CreateIndex
CREATE UNIQUE INDEX "UnidadeEnsino_pontoParadaId_key" ON "UnidadeEnsino"("pontoParadaId");

-- CreateIndex
CREATE INDEX "UnidadeEnsino_instituicaoEnsinoId_idx" ON "UnidadeEnsino"("instituicaoEnsinoId");

-- CreateIndex
CREATE UNIQUE INDEX "UnidadeEnsino_instituicaoEnsinoId_nome_key" ON "UnidadeEnsino"("instituicaoEnsinoId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "Rota_nome_key" ON "Rota"("nome");

-- CreateIndex
CREATE INDEX "RotaParada_rotaId_idx" ON "RotaParada"("rotaId");

-- CreateIndex
CREATE INDEX "RotaParada_pontoParadaId_idx" ON "RotaParada"("pontoParadaId");

-- CreateIndex
CREATE UNIQUE INDEX "RotaParada_rotaId_pontoParadaId_key" ON "RotaParada"("rotaId", "pontoParadaId");

-- CreateIndex
CREATE UNIQUE INDEX "RotaParada_rotaId_ordem_key" ON "RotaParada"("rotaId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "Veiculo_placa_key" ON "Veiculo"("placa");

-- CreateIndex
CREATE INDEX "EscalaSemanal_rotaId_idx" ON "EscalaSemanal"("rotaId");

-- CreateIndex
CREATE INDEX "EscalaSemanal_motoristaId_idx" ON "EscalaSemanal"("motoristaId");

-- CreateIndex
CREATE INDEX "EscalaSemanal_veiculoId_idx" ON "EscalaSemanal"("veiculoId");

-- CreateIndex
CREATE UNIQUE INDEX "EscalaSemanal_diaSemana_turno_rotaId_key" ON "EscalaSemanal"("diaSemana", "turno", "rotaId");

-- CreateIndex
CREATE INDEX "Viagem_rotaId_idx" ON "Viagem"("rotaId");

-- CreateIndex
CREATE INDEX "Viagem_escalaSemanalId_idx" ON "Viagem"("escalaSemanalId");

-- CreateIndex
CREATE INDEX "Viagem_criadaPorId_idx" ON "Viagem"("criadaPorId");

-- CreateIndex
CREATE INDEX "Viagem_canceladaPorId_idx" ON "Viagem"("canceladaPorId");

-- CreateIndex
CREATE UNIQUE INDEX "Viagem_data_turno_rotaId_key" ON "Viagem"("data", "turno", "rotaId");

-- CreateIndex
CREATE INDEX "TrechoViagem_status_saidaPrevistaEm_idx" ON "TrechoViagem"("status", "saidaPrevistaEm");

-- CreateIndex
CREATE INDEX "TrechoViagem_viagemId_idx" ON "TrechoViagem"("viagemId");

-- CreateIndex
CREATE INDEX "TrechoViagem_canceladoPorId_idx" ON "TrechoViagem"("canceladoPorId");

-- CreateIndex
CREATE UNIQUE INDEX "TrechoViagem_viagemId_sentido_key" ON "TrechoViagem"("viagemId", "sentido");

-- CreateIndex
CREATE INDEX "ParadaTrecho_trechoId_idx" ON "ParadaTrecho"("trechoId");

-- CreateIndex
CREATE INDEX "ParadaTrecho_pontoParadaId_idx" ON "ParadaTrecho"("pontoParadaId");

-- CreateIndex
CREATE UNIQUE INDEX "ParadaTrecho_trechoId_pontoParadaId_key" ON "ParadaTrecho"("trechoId", "pontoParadaId");

-- CreateIndex
CREATE UNIQUE INDEX "ParadaTrecho_trechoId_ordem_key" ON "ParadaTrecho"("trechoId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "AtendimentoTrecho_solicitacaoReservaId_key" ON "AtendimentoTrecho"("solicitacaoReservaId");

-- CreateIndex
CREATE INDEX "AtendimentoTrecho_trechoId_idx" ON "AtendimentoTrecho"("trechoId");

-- CreateIndex
CREATE INDEX "AtendimentoTrecho_veiculoId_idx" ON "AtendimentoTrecho"("veiculoId");

-- CreateIndex
CREATE INDEX "AtendimentoTrecho_motoristaId_idx" ON "AtendimentoTrecho"("motoristaId");

-- CreateIndex
CREATE UNIQUE INDEX "AtendimentoTrecho_trechoId_prioridade_key" ON "AtendimentoTrecho"("trechoId", "prioridade");

-- CreateIndex
CREATE INDEX "AlteracaoAtendimento_atendimentoId_idx" ON "AlteracaoAtendimento"("atendimentoId");

-- CreateIndex
CREATE INDEX "AlteracaoAtendimento_realizadaPorId_idx" ON "AlteracaoAtendimento"("realizadaPorId");

-- CreateIndex
CREATE INDEX "SolicitacaoReserva_trechoId_idx" ON "SolicitacaoReserva"("trechoId");

-- CreateIndex
CREATE INDEX "SolicitacaoReserva_solicitadaPorId_idx" ON "SolicitacaoReserva"("solicitadaPorId");

-- CreateIndex
CREATE UNIQUE INDEX "ParticipacaoTrecho_ordemFila_key" ON "ParticipacaoTrecho"("ordemFila");

-- CreateIndex
CREATE INDEX "ParticipacaoTrecho_trechoId_status_ordemFila_idx" ON "ParticipacaoTrecho"("trechoId", "status", "ordemFila");

-- CreateIndex
CREATE INDEX "ParticipacaoTrecho_trechoId_idx" ON "ParticipacaoTrecho"("trechoId");

-- CreateIndex
CREATE INDEX "ParticipacaoTrecho_estudanteId_idx" ON "ParticipacaoTrecho"("estudanteId");

-- CreateIndex
CREATE INDEX "ParticipacaoTrecho_origemId_idx" ON "ParticipacaoTrecho"("origemId");

-- CreateIndex
CREATE INDEX "ParticipacaoTrecho_destinoId_idx" ON "ParticipacaoTrecho"("destinoId");

-- CreateIndex
CREATE INDEX "ParticipacaoTrecho_atendimentoId_idx" ON "ParticipacaoTrecho"("atendimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "ParticipacaoTrecho_trechoId_estudanteId_key" ON "ParticipacaoTrecho"("trechoId", "estudanteId");

-- CreateIndex
CREATE INDEX "AlteracaoParticipacao_participacaoId_idx" ON "AlteracaoParticipacao"("participacaoId");

-- CreateIndex
CREATE INDEX "AlteracaoParticipacao_realizadaPorId_idx" ON "AlteracaoParticipacao"("realizadaPorId");

-- CreateIndex
CREATE UNIQUE INDEX "Embarque_chaveIdempotencia_key" ON "Embarque"("chaveIdempotencia");

-- CreateIndex
CREATE INDEX "Embarque_participacaoId_idx" ON "Embarque"("participacaoId");

-- CreateIndex
CREATE INDEX "Embarque_atendimentoId_idx" ON "Embarque"("atendimentoId");

-- CreateIndex
CREATE INDEX "Embarque_registradoPorId_idx" ON "Embarque"("registradoPorId");

-- CreateIndex
CREATE INDEX "Embarque_estornadoPorId_idx" ON "Embarque"("estornadoPorId");

-- CreateIndex
CREATE INDEX "Embarque_motoristaId_idx" ON "Embarque"("motoristaId");

-- CreateIndex
CREATE INDEX "Embarque_veiculoId_idx" ON "Embarque"("veiculoId");

-- CreateIndex
CREATE UNIQUE INDEX "Carteira_estudanteId_key" ON "Carteira"("estudanteId");

-- CreateIndex
CREATE UNIQUE INDEX "Recarga_identificadorPagamento_key" ON "Recarga"("identificadorPagamento");

-- CreateIndex
CREATE UNIQUE INDEX "Recarga_chaveIdempotencia_key" ON "Recarga"("chaveIdempotencia");

-- CreateIndex
CREATE INDEX "Recarga_carteiraId_status_idx" ON "Recarga"("carteiraId", "status");

-- CreateIndex
CREATE INDEX "Recarga_carteiraId_idx" ON "Recarga"("carteiraId");

-- CreateIndex
CREATE INDEX "Recarga_analisadaPorId_idx" ON "Recarga"("analisadaPorId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimentacaoCarteira_chaveIdempotencia_key" ON "MovimentacaoCarteira"("chaveIdempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "MovimentacaoCarteira_recargaId_key" ON "MovimentacaoCarteira"("recargaId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimentacaoCarteira_embarqueId_key" ON "MovimentacaoCarteira"("embarqueId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimentacaoCarteira_movimentacaoOriginalId_key" ON "MovimentacaoCarteira"("movimentacaoOriginalId");

-- CreateIndex
CREATE INDEX "MovimentacaoCarteira_carteiraId_criadoEm_idx" ON "MovimentacaoCarteira"("carteiraId", "criadoEm");

-- CreateIndex
CREATE INDEX "MovimentacaoCarteira_carteiraId_idx" ON "MovimentacaoCarteira"("carteiraId");

-- CreateIndex
CREATE INDEX "MovimentacaoCarteira_realizadaPorId_idx" ON "MovimentacaoCarteira"("realizadaPorId");

-- CreateIndex
CREATE INDEX "IndisponibilidadeMotorista_status_idx" ON "IndisponibilidadeMotorista"("status");

-- CreateIndex
CREATE INDEX "IndisponibilidadeMotorista_atendimentoId_idx" ON "IndisponibilidadeMotorista"("atendimentoId");

-- CreateIndex
CREATE INDEX "IndisponibilidadeMotorista_motoristaId_idx" ON "IndisponibilidadeMotorista"("motoristaId");

-- CreateIndex
CREATE INDEX "IndisponibilidadeMotorista_resolvidaPorId_idx" ON "IndisponibilidadeMotorista"("resolvidaPorId");

-- CreateIndex
CREATE INDEX "Aviso_publicadoPorId_idx" ON "Aviso"("publicadoPorId");

-- CreateIndex
CREATE UNIQUE INDEX "DispositivoUsuario_expoPushToken_key" ON "DispositivoUsuario"("expoPushToken");

-- CreateIndex
CREATE INDEX "DispositivoUsuario_usuarioId_idx" ON "DispositivoUsuario"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Notificacao_chaveDeduplicacao_key" ON "Notificacao"("chaveDeduplicacao");

-- CreateIndex
CREATE INDEX "Notificacao_usuarioId_criadoEm_idx" ON "Notificacao"("usuarioId", "criadoEm");

-- CreateIndex
CREATE INDEX "Notificacao_usuarioId_idx" ON "Notificacao"("usuarioId");

-- CreateIndex
CREATE INDEX "Notificacao_avisoId_idx" ON "Notificacao"("avisoId");

-- CreateIndex
CREATE UNIQUE INDEX "EntregaNotificacao_chaveDeduplicacao_key" ON "EntregaNotificacao"("chaveDeduplicacao");

-- CreateIndex
CREATE INDEX "EntregaNotificacao_status_agendadaPara_idx" ON "EntregaNotificacao"("status", "agendadaPara");

-- CreateIndex
CREATE INDEX "EntregaNotificacao_notificacaoId_idx" ON "EntregaNotificacao"("notificacaoId");

-- CreateIndex
CREATE INDEX "EntregaNotificacao_dispositivoId_idx" ON "EntregaNotificacao"("dispositivoId");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_cadastradoPorId_fkey" FOREIGN KEY ("cadastradoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenAcesso" ADD CONSTRAINT "TokenAcesso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estudante" ADD CONSTRAINT "Estudante_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estudante" ADD CONSTRAINT "Estudante_unidadeEnsinoId_fkey" FOREIGN KEY ("unidadeEnsinoId") REFERENCES "UnidadeEnsino"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estudante" ADD CONSTRAINT "Estudante_analisadoPorId_fkey" FOREIGN KEY ("analisadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Motorista" ADD CONSTRAINT "Motorista_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprovanteMatricula" ADD CONSTRAINT "ComprovanteMatricula_estudanteId_fkey" FOREIGN KEY ("estudanteId") REFERENCES "Estudante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprovanteMatricula" ADD CONSTRAINT "ComprovanteMatricula_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnidadeEnsino" ADD CONSTRAINT "UnidadeEnsino_instituicaoEnsinoId_fkey" FOREIGN KEY ("instituicaoEnsinoId") REFERENCES "InstituicaoEnsino"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnidadeEnsino" ADD CONSTRAINT "UnidadeEnsino_pontoParadaId_fkey" FOREIGN KEY ("pontoParadaId") REFERENCES "PontoParada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RotaParada" ADD CONSTRAINT "RotaParada_rotaId_fkey" FOREIGN KEY ("rotaId") REFERENCES "Rota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RotaParada" ADD CONSTRAINT "RotaParada_pontoParadaId_fkey" FOREIGN KEY ("pontoParadaId") REFERENCES "PontoParada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalaSemanal" ADD CONSTRAINT "EscalaSemanal_rotaId_fkey" FOREIGN KEY ("rotaId") REFERENCES "Rota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalaSemanal" ADD CONSTRAINT "EscalaSemanal_motoristaId_fkey" FOREIGN KEY ("motoristaId") REFERENCES "Motorista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalaSemanal" ADD CONSTRAINT "EscalaSemanal_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "Veiculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viagem" ADD CONSTRAINT "Viagem_rotaId_fkey" FOREIGN KEY ("rotaId") REFERENCES "Rota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viagem" ADD CONSTRAINT "Viagem_escalaSemanalId_fkey" FOREIGN KEY ("escalaSemanalId") REFERENCES "EscalaSemanal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viagem" ADD CONSTRAINT "Viagem_criadaPorId_fkey" FOREIGN KEY ("criadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viagem" ADD CONSTRAINT "Viagem_canceladaPorId_fkey" FOREIGN KEY ("canceladaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrechoViagem" ADD CONSTRAINT "TrechoViagem_viagemId_fkey" FOREIGN KEY ("viagemId") REFERENCES "Viagem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrechoViagem" ADD CONSTRAINT "TrechoViagem_canceladoPorId_fkey" FOREIGN KEY ("canceladoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParadaTrecho" ADD CONSTRAINT "ParadaTrecho_trechoId_fkey" FOREIGN KEY ("trechoId") REFERENCES "TrechoViagem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParadaTrecho" ADD CONSTRAINT "ParadaTrecho_pontoParadaId_fkey" FOREIGN KEY ("pontoParadaId") REFERENCES "PontoParada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtendimentoTrecho" ADD CONSTRAINT "AtendimentoTrecho_trechoId_fkey" FOREIGN KEY ("trechoId") REFERENCES "TrechoViagem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtendimentoTrecho" ADD CONSTRAINT "AtendimentoTrecho_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "Veiculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtendimentoTrecho" ADD CONSTRAINT "AtendimentoTrecho_motoristaId_fkey" FOREIGN KEY ("motoristaId") REFERENCES "Motorista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtendimentoTrecho" ADD CONSTRAINT "AtendimentoTrecho_solicitacaoReservaId_fkey" FOREIGN KEY ("solicitacaoReservaId") REFERENCES "SolicitacaoReserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlteracaoAtendimento" ADD CONSTRAINT "AlteracaoAtendimento_atendimentoId_fkey" FOREIGN KEY ("atendimentoId") REFERENCES "AtendimentoTrecho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlteracaoAtendimento" ADD CONSTRAINT "AlteracaoAtendimento_realizadaPorId_fkey" FOREIGN KEY ("realizadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoReserva" ADD CONSTRAINT "SolicitacaoReserva_trechoId_fkey" FOREIGN KEY ("trechoId") REFERENCES "TrechoViagem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoReserva" ADD CONSTRAINT "SolicitacaoReserva_solicitadaPorId_fkey" FOREIGN KEY ("solicitadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipacaoTrecho" ADD CONSTRAINT "ParticipacaoTrecho_trechoId_fkey" FOREIGN KEY ("trechoId") REFERENCES "TrechoViagem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipacaoTrecho" ADD CONSTRAINT "ParticipacaoTrecho_estudanteId_fkey" FOREIGN KEY ("estudanteId") REFERENCES "Estudante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipacaoTrecho" ADD CONSTRAINT "ParticipacaoTrecho_origemId_fkey" FOREIGN KEY ("origemId") REFERENCES "ParadaTrecho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipacaoTrecho" ADD CONSTRAINT "ParticipacaoTrecho_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "ParadaTrecho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipacaoTrecho" ADD CONSTRAINT "ParticipacaoTrecho_atendimentoId_fkey" FOREIGN KEY ("atendimentoId") REFERENCES "AtendimentoTrecho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlteracaoParticipacao" ADD CONSTRAINT "AlteracaoParticipacao_participacaoId_fkey" FOREIGN KEY ("participacaoId") REFERENCES "ParticipacaoTrecho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlteracaoParticipacao" ADD CONSTRAINT "AlteracaoParticipacao_realizadaPorId_fkey" FOREIGN KEY ("realizadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Embarque" ADD CONSTRAINT "Embarque_participacaoId_fkey" FOREIGN KEY ("participacaoId") REFERENCES "ParticipacaoTrecho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Embarque" ADD CONSTRAINT "Embarque_atendimentoId_fkey" FOREIGN KEY ("atendimentoId") REFERENCES "AtendimentoTrecho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Embarque" ADD CONSTRAINT "Embarque_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Embarque" ADD CONSTRAINT "Embarque_estornadoPorId_fkey" FOREIGN KEY ("estornadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Embarque" ADD CONSTRAINT "Embarque_motoristaId_fkey" FOREIGN KEY ("motoristaId") REFERENCES "Motorista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Embarque" ADD CONSTRAINT "Embarque_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "Veiculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Carteira" ADD CONSTRAINT "Carteira_estudanteId_fkey" FOREIGN KEY ("estudanteId") REFERENCES "Estudante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recarga" ADD CONSTRAINT "Recarga_carteiraId_fkey" FOREIGN KEY ("carteiraId") REFERENCES "Carteira"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recarga" ADD CONSTRAINT "Recarga_analisadaPorId_fkey" FOREIGN KEY ("analisadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoCarteira" ADD CONSTRAINT "MovimentacaoCarteira_carteiraId_fkey" FOREIGN KEY ("carteiraId") REFERENCES "Carteira"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoCarteira" ADD CONSTRAINT "MovimentacaoCarteira_recargaId_fkey" FOREIGN KEY ("recargaId") REFERENCES "Recarga"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoCarteira" ADD CONSTRAINT "MovimentacaoCarteira_embarqueId_fkey" FOREIGN KEY ("embarqueId") REFERENCES "Embarque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoCarteira" ADD CONSTRAINT "MovimentacaoCarteira_movimentacaoOriginalId_fkey" FOREIGN KEY ("movimentacaoOriginalId") REFERENCES "MovimentacaoCarteira"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoCarteira" ADD CONSTRAINT "MovimentacaoCarteira_realizadaPorId_fkey" FOREIGN KEY ("realizadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndisponibilidadeMotorista" ADD CONSTRAINT "IndisponibilidadeMotorista_atendimentoId_fkey" FOREIGN KEY ("atendimentoId") REFERENCES "AtendimentoTrecho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndisponibilidadeMotorista" ADD CONSTRAINT "IndisponibilidadeMotorista_motoristaId_fkey" FOREIGN KEY ("motoristaId") REFERENCES "Motorista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndisponibilidadeMotorista" ADD CONSTRAINT "IndisponibilidadeMotorista_resolvidaPorId_fkey" FOREIGN KEY ("resolvidaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aviso" ADD CONSTRAINT "Aviso_publicadoPorId_fkey" FOREIGN KEY ("publicadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispositivoUsuario" ADD CONSTRAINT "DispositivoUsuario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_avisoId_fkey" FOREIGN KEY ("avisoId") REFERENCES "Aviso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntregaNotificacao" ADD CONSTRAINT "EntregaNotificacao_notificacaoId_fkey" FOREIGN KEY ("notificacaoId") REFERENCES "Notificacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntregaNotificacao" ADD CONSTRAINT "EntregaNotificacao_dispositivoId_fkey" FOREIGN KEY ("dispositivoId") REFERENCES "DispositivoUsuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
