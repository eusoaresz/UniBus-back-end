BEGIN;
CREATE TABLE "AlteracaoVeiculo" (
  "id" UUID NOT NULL,
  "veiculoId" UUID NOT NULL,
  "realizadaPorId" UUID NOT NULL,
  "motivo" TEXT NOT NULL,
  "dadosAnteriores" JSONB NOT NULL,
  "dadosNovos" JSONB NOT NULL,
  "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AlteracaoVeiculo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AlteracaoVeiculo_veiculoId_criadoEm_idx" ON "AlteracaoVeiculo"("veiculoId", "criadoEm");
CREATE INDEX "AlteracaoVeiculo_realizadaPorId_idx" ON "AlteracaoVeiculo"("realizadaPorId");
ALTER TABLE "AlteracaoVeiculo" ADD CONSTRAINT "AlteracaoVeiculo_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "Veiculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlteracaoVeiculo" ADD CONSTRAINT "AlteracaoVeiculo_realizadaPorId_fkey" FOREIGN KEY ("realizadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
