BEGIN;
ALTER TYPE "StatusCadastroEstudante" ADD VALUE 'ENCERRADO';
CREATE TABLE "AlteracaoAviso" (
  "id" UUID NOT NULL,
  "avisoId" UUID NOT NULL,
  "realizadaPorId" UUID NOT NULL,
  "motivo" TEXT NOT NULL,
  "dadosAnteriores" JSONB NOT NULL,
  "dadosNovos" JSONB NOT NULL,
  "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AlteracaoAviso_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AlteracaoAviso_avisoId_criadoEm_idx" ON "AlteracaoAviso"("avisoId", "criadoEm");
CREATE INDEX "AlteracaoAviso_realizadaPorId_idx" ON "AlteracaoAviso"("realizadaPorId");
ALTER TABLE "AlteracaoAviso" ADD CONSTRAINT "AlteracaoAviso_avisoId_fkey" FOREIGN KEY ("avisoId") REFERENCES "Aviso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlteracaoAviso" ADD CONSTRAINT "AlteracaoAviso_realizadaPorId_fkey" FOREIGN KEY ("realizadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
