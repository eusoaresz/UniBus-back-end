BEGIN;
ALTER TABLE "Viagem" ADD COLUMN "revisaoRotaPendente" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "AlteracaoCatalogo" (
  "id" UUID NOT NULL,
  "rotaId" UUID,
  "cidadeId" UUID,
  "realizadaPorId" UUID NOT NULL,
  "motivo" TEXT NOT NULL,
  "dadosAnteriores" JSONB NOT NULL,
  "dadosNovos" JSONB NOT NULL,
  "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AlteracaoCatalogo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AlteracaoCatalogo_alvo_check" CHECK (num_nonnulls("rotaId", "cidadeId") = 1)
);
CREATE INDEX "AlteracaoCatalogo_rotaId_criadoEm_idx" ON "AlteracaoCatalogo"("rotaId", "criadoEm");
CREATE INDEX "AlteracaoCatalogo_cidadeId_criadoEm_idx" ON "AlteracaoCatalogo"("cidadeId", "criadoEm");
CREATE INDEX "AlteracaoCatalogo_realizadaPorId_idx" ON "AlteracaoCatalogo"("realizadaPorId");
ALTER TABLE "AlteracaoCatalogo" ADD CONSTRAINT "AlteracaoCatalogo_rotaId_fkey" FOREIGN KEY ("rotaId") REFERENCES "Rota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlteracaoCatalogo" ADD CONSTRAINT "AlteracaoCatalogo_cidadeId_fkey" FOREIGN KEY ("cidadeId") REFERENCES "Cidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlteracaoCatalogo" ADD CONSTRAINT "AlteracaoCatalogo_realizadaPorId_fkey" FOREIGN KEY ("realizadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
