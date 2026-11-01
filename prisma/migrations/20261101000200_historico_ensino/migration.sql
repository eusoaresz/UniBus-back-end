BEGIN;
CREATE TABLE "AlteracaoEnsino" (
  "id" UUID NOT NULL,
  "instituicaoEnsinoId" UUID,
  "unidadeEnsinoId" UUID,
  "pontoParadaId" UUID,
  "realizadaPorId" UUID NOT NULL,
  "motivo" TEXT NOT NULL,
  "dadosAnteriores" JSONB NOT NULL,
  "dadosNovos" JSONB NOT NULL,
  "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AlteracaoEnsino_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AlteracaoEnsino_alvo_check" CHECK (num_nonnulls("instituicaoEnsinoId", "unidadeEnsinoId", "pontoParadaId") = 1)
);
CREATE INDEX "AlteracaoEnsino_instituicaoEnsinoId_criadoEm_idx" ON "AlteracaoEnsino"("instituicaoEnsinoId", "criadoEm");
CREATE INDEX "AlteracaoEnsino_unidadeEnsinoId_criadoEm_idx" ON "AlteracaoEnsino"("unidadeEnsinoId", "criadoEm");
CREATE INDEX "AlteracaoEnsino_pontoParadaId_criadoEm_idx" ON "AlteracaoEnsino"("pontoParadaId", "criadoEm");
CREATE INDEX "AlteracaoEnsino_realizadaPorId_idx" ON "AlteracaoEnsino"("realizadaPorId");
ALTER TABLE "AlteracaoEnsino" ADD CONSTRAINT "AlteracaoEnsino_instituicaoEnsinoId_fkey" FOREIGN KEY ("instituicaoEnsinoId") REFERENCES "InstituicaoEnsino"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlteracaoEnsino" ADD CONSTRAINT "AlteracaoEnsino_unidadeEnsinoId_fkey" FOREIGN KEY ("unidadeEnsinoId") REFERENCES "UnidadeEnsino"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlteracaoEnsino" ADD CONSTRAINT "AlteracaoEnsino_pontoParadaId_fkey" FOREIGN KEY ("pontoParadaId") REFERENCES "PontoParada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlteracaoEnsino" ADD CONSTRAINT "AlteracaoEnsino_realizadaPorId_fkey" FOREIGN KEY ("realizadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
