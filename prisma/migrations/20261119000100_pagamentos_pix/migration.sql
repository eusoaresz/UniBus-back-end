ALTER TABLE "MovimentacaoCarteira" ALTER COLUMN "realizadaPorId" DROP NOT NULL;
CREATE TABLE "Pagamento" (
  "recargaId" UUID NOT NULL PRIMARY KEY,
  "provedor" TEXT NOT NULL DEFAULT 'STRIPE',
  "ambiente" TEXT NOT NULL,
  "referencia" TEXT,
  "chaveCriacao" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CRIANDO',
  "revisaoNecessaria" BOOLEAN NOT NULL DEFAULT false,
  "motivoRevisao" TEXT,
  "proximaConsultaEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Pagamento_recargaId_fkey" FOREIGN KEY ("recargaId") REFERENCES "Recarga"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Pagamento_referencia_key" ON "Pagamento"("referencia");
CREATE UNIQUE INDEX "Pagamento_chaveCriacao_key" ON "Pagamento"("chaveCriacao");
CREATE INDEX "Pagamento_status_proximaConsultaEm_idx" ON "Pagamento"("status", "proximaConsultaEm");
