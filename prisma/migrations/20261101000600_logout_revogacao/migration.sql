BEGIN;
ALTER TABLE "Usuario" ADD COLUMN "tokensRevogadosAte" TIMESTAMPTZ(3);
CREATE TABLE "TokenRevogado" (
  "tokenHash" VARCHAR(64) NOT NULL PRIMARY KEY,
  "usuarioId" UUID NOT NULL,
  "expiraEm" TIMESTAMPTZ(3) NOT NULL,
  "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TokenRevogado_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "TokenRevogado_expiraEm_idx" ON "TokenRevogado"("expiraEm");
CREATE INDEX "TokenRevogado_usuarioId_idx" ON "TokenRevogado"("usuarioId");
COMMIT;
