BEGIN;
ALTER TABLE "ParadaTrecho" ADD COLUMN versao INTEGER NOT NULL DEFAULT 1, ADD COLUMN ativa BOOLEAN NOT NULL DEFAULT true;
DROP INDEX "ParadaTrecho_trechoId_pontoParadaId_key";
DROP INDEX "ParadaTrecho_trechoId_ordem_key";
CREATE UNIQUE INDEX "ParadaTrecho_trechoId_versao_pontoParadaId_key" ON "ParadaTrecho"("trechoId", versao, "pontoParadaId");
CREATE UNIQUE INDEX "ParadaTrecho_trechoId_versao_ordem_key" ON "ParadaTrecho"("trechoId", versao, ordem);
COMMIT;
