CREATE TABLE "Cidade" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Cidade_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Preferencias" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "turnos" "Turno"[] DEFAULT ARRAY[]::"Turno"[],
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Preferencias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PreferenciaRota" (
    "preferenciasId" UUID NOT NULL,
    "rotaId" UUID NOT NULL,
    CONSTRAINT "PreferenciaRota_pkey" PRIMARY KEY ("preferenciasId", "rotaId")
);

CREATE TABLE "PreferenciaCidade" (
    "preferenciasId" UUID NOT NULL,
    "cidadeId" UUID NOT NULL,
    CONSTRAINT "PreferenciaCidade_pkey" PRIMARY KEY ("preferenciasId", "cidadeId")
);

CREATE UNIQUE INDEX "Cidade_nome_key" ON "Cidade"("nome");
CREATE UNIQUE INDEX "Preferencias_usuarioId_key" ON "Preferencias"("usuarioId");
CREATE INDEX "PreferenciaRota_rotaId_idx" ON "PreferenciaRota"("rotaId");
CREATE INDEX "PreferenciaCidade_cidadeId_idx" ON "PreferenciaCidade"("cidadeId");

ALTER TABLE "Preferencias" ADD CONSTRAINT "Preferencias_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PreferenciaRota" ADD CONSTRAINT "PreferenciaRota_preferenciasId_fkey"
  FOREIGN KEY ("preferenciasId") REFERENCES "Preferencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PreferenciaRota" ADD CONSTRAINT "PreferenciaRota_rotaId_fkey"
  FOREIGN KEY ("rotaId") REFERENCES "Rota"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PreferenciaCidade" ADD CONSTRAINT "PreferenciaCidade_preferenciasId_fkey"
  FOREIGN KEY ("preferenciasId") REFERENCES "Preferencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PreferenciaCidade" ADD CONSTRAINT "PreferenciaCidade_cidadeId_fkey"
  FOREIGN KEY ("cidadeId") REFERENCES "Cidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
