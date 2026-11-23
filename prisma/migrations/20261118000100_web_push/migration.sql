ALTER TABLE "DispositivoUsuario"
  ALTER COLUMN "expoPushToken" DROP NOT NULL,
  ADD COLUMN "webEndpoint" TEXT,
  ADD COLUMN "webP256dh" TEXT,
  ADD COLUMN "webAuth" TEXT,
  ADD COLUMN "sessaoHash" TEXT,
  ADD COLUMN "expiraEm" TIMESTAMPTZ(3);
CREATE UNIQUE INDEX "DispositivoUsuario_webEndpoint_key" ON "DispositivoUsuario"("webEndpoint");
