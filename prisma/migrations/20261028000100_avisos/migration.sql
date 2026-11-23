CREATE TYPE "CategoriaAviso" AS ENUM ('GERAL', 'VIAGENS');

ALTER TABLE "Aviso"
ADD COLUMN "categoria" "CategoriaAviso" NOT NULL DEFAULT 'GERAL',
ADD COLUMN "importante" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Aviso_ativo_publicadoEm_idx" ON "Aviso"("ativo", "publicadoEm");
