-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "dataNascimento" DATE,
ADD COLUMN     "fotoChave" VARCHAR(36);

-- AlterTable
ALTER TABLE "Estudante" ADD COLUMN     "cidadeOrigemId" UUID,
ADD COLUMN     "curso" VARCHAR(150);

-- CreateTable
CREATE TABLE "AlteracaoPerfil" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "realizadaPorId" UUID NOT NULL,
    "motivo" TEXT NOT NULL,
    "dadosAnteriores" JSONB NOT NULL,
    "dadosNovos" JSONB NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlteracaoPerfil_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlteracaoPerfil_usuarioId_criadoEm_idx" ON "AlteracaoPerfil"("usuarioId", "criadoEm");

-- CreateIndex
CREATE INDEX "AlteracaoPerfil_realizadaPorId_idx" ON "AlteracaoPerfil"("realizadaPorId");

-- AddForeignKey
ALTER TABLE "Estudante" ADD CONSTRAINT "Estudante_cidadeOrigemId_fkey" FOREIGN KEY ("cidadeOrigemId") REFERENCES "Cidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlteracaoPerfil" ADD CONSTRAINT "AlteracaoPerfil_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlteracaoPerfil" ADD CONSTRAINT "AlteracaoPerfil_realizadaPorId_fkey" FOREIGN KEY ("realizadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

