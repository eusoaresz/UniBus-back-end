BEGIN;
CREATE TABLE "PreferenciasNotificacao" (
  "usuarioId" UUID NOT NULL PRIMARY KEY,
  "ativadas" BOOLEAN NOT NULL DEFAULT true,
  "confirmacoes" BOOLEAN NOT NULL DEFAULT true,
  "alteracoesRota" BOOLEAN NOT NULL DEFAULT true,
  "cancelamentos" BOOLEAN NOT NULL DEFAULT true,
  "lembretes" BOOLEAN NOT NULL DEFAULT true,
  "avisosOperador" BOOLEAN NOT NULL DEFAULT true,
  "novidades" BOOLEAN NOT NULL DEFAULT true,
  "carteira" BOOLEAN NOT NULL DEFAULT true,
  "disciplina" BOOLEAN NOT NULL DEFAULT true,
  "operacao" BOOLEAN NOT NULL DEFAULT true,
  "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PreferenciasNotificacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
ALTER TABLE "Notificacao" ADD COLUMN "tema" VARCHAR(32) NOT NULL DEFAULT 'OPERACAO',
  ADD COLUMN "alertaHabilitado" BOOLEAN NOT NULL DEFAULT true;
UPDATE "Notificacao" SET "tema" = CASE
  WHEN "tipo" = 'RECARGA' OR "chaveDeduplicacao" LIKE 'saldo-fila:%' THEN 'CARTEIRA'
  WHEN "chaveDeduplicacao" LIKE 'confirmacao:%' THEN 'CONFIRMACOES'
  WHEN "chaveDeduplicacao" LIKE 'cancelamento:%' THEN 'CANCELAMENTOS'
  WHEN "chaveDeduplicacao" LIKE 'rota:%' THEN 'ALTERACOES_ROTA'
  WHEN "chaveDeduplicacao" LIKE 'horario:%' THEN 'LEMBRETES'
  WHEN "chaveDeduplicacao" ~ '^(justificativa|advertencia|analise-falta|liberacao):' THEN 'DISCIPLINA'
  ELSE 'OPERACAO' END;
CREATE INDEX "Notificacao_usuarioId_alertaHabilitado_lidaEm_idx" ON "Notificacao"("usuarioId", "alertaHabilitado", "lidaEm");
COMMIT;
