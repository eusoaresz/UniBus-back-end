BEGIN;

-- CreateEnum
CREATE TYPE "StatusConvocacaoVan" AS ENUM ('PENDENTE', 'ACEITA', 'RECUSADA', 'EXPIRADA', 'CANCELADA');

ALTER TABLE "ParticipacaoTrecho" ADD COLUMN "confirmacaoTardia" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "bloqueioDisciplinarAte" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "SemestreLetivo" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fim" TIMESTAMPTZ(3) NOT NULL,
    "criadoPorId" UUID NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SemestreLetivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Falta" (
    "id" UUID NOT NULL,
    "participacaoId" UUID NOT NULL,
    "estudanteId" UUID NOT NULL,
    "semestreId" UUID NOT NULL,
    "justificativa" TEXT,
    "justificada" BOOLEAN NOT NULL DEFAULT false,
    "analisadoEm" TIMESTAMPTZ(3),
    "analisadoPorId" UUID,
    "motivoAnalise" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Falta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Advertencia" (
    "id" UUID NOT NULL,
    "estudanteId" UUID NOT NULL,
    "semestreId" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "liberadaEm" TIMESTAMPTZ(3),
    "motivoLiberacao" TEXT,
    "liberadaPorId" UUID,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Advertencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConvocacaoVan" (
    "id" UUID NOT NULL,
    "trechoId" UUID NOT NULL,
    "motoristaId" UUID NOT NULL,
    "veiculoId" UUID NOT NULL,
    "solicitadaPorId" UUID NOT NULL,
    "status" "StatusConvocacaoVan" NOT NULL DEFAULT 'PENDENTE',
    "responderAte" TIMESTAMPTZ(3) NOT NULL,
    "respondidaEm" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConvocacaoVan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SemestreLetivo_inicio_fim_idx" ON "SemestreLetivo"("inicio", "fim");

-- CreateIndex
CREATE UNIQUE INDEX "Falta_participacaoId_key" ON "Falta"("participacaoId");

-- CreateIndex
CREATE INDEX "Falta_estudanteId_semestreId_justificada_idx" ON "Falta"("estudanteId", "semestreId", "justificada");

-- CreateIndex
CREATE UNIQUE INDEX "Advertencia_estudanteId_semestreId_numero_key" ON "Advertencia"("estudanteId", "semestreId", "numero");

-- CreateIndex
CREATE INDEX "ConvocacaoVan_trechoId_status_idx" ON "ConvocacaoVan"("trechoId", "status");

-- CreateIndex
CREATE INDEX "ConvocacaoVan_motoristaId_status_idx" ON "ConvocacaoVan"("motoristaId", "status");

-- AddForeignKey
ALTER TABLE "SemestreLetivo" ADD CONSTRAINT "SemestreLetivo_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Falta" ADD CONSTRAINT "Falta_participacaoId_fkey" FOREIGN KEY ("participacaoId") REFERENCES "ParticipacaoTrecho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Falta" ADD CONSTRAINT "Falta_estudanteId_fkey" FOREIGN KEY ("estudanteId") REFERENCES "Estudante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Falta" ADD CONSTRAINT "Falta_semestreId_fkey" FOREIGN KEY ("semestreId") REFERENCES "SemestreLetivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Falta" ADD CONSTRAINT "Falta_analisadoPorId_fkey" FOREIGN KEY ("analisadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advertencia" ADD CONSTRAINT "Advertencia_estudanteId_fkey" FOREIGN KEY ("estudanteId") REFERENCES "Estudante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advertencia" ADD CONSTRAINT "Advertencia_semestreId_fkey" FOREIGN KEY ("semestreId") REFERENCES "SemestreLetivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advertencia" ADD CONSTRAINT "Advertencia_liberadaPorId_fkey" FOREIGN KEY ("liberadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvocacaoVan" ADD CONSTRAINT "ConvocacaoVan_trechoId_fkey" FOREIGN KEY ("trechoId") REFERENCES "TrechoViagem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvocacaoVan" ADD CONSTRAINT "ConvocacaoVan_motoristaId_fkey" FOREIGN KEY ("motoristaId") REFERENCES "Motorista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvocacaoVan" ADD CONSTRAINT "ConvocacaoVan_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "Veiculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvocacaoVan" ADD CONSTRAINT "ConvocacaoVan_solicitadaPorId_fkey" FOREIGN KEY ("solicitadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "SemestreLetivo" ADD CONSTRAINT "SemestreLetivo_intervalo_check" CHECK (fim > inicio);
ALTER TABLE "Advertencia" ADD CONSTRAINT "Advertencia_numero_check" CHECK (numero BETWEEN 1 AND 3);

COMMIT;
