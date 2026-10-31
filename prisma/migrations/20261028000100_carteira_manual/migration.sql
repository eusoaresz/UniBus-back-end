BEGIN;
LOCK TABLE "Carteira", "Recarga", "MovimentacaoCarteira", "Estudante", "ParticipacaoTrecho", "Embarque" IN ACCESS EXCLUSIVE MODE;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Estudante" GROUP BY "unidadeEnsinoId", matricula HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Existem matrículas duplicadas na mesma unidade';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "MovimentacaoCarteira" m
    LEFT JOIN "Embarque" e ON e.id = m."embarqueId"
    LEFT JOIN "ParticipacaoTrecho" p ON p.id = e."participacaoId"
    LEFT JOIN "Carteira" c ON c.id = m."carteiraId"
    WHERE m.tipo = 'COBRANCA_EMBARQUE' AND (p.id IS NULL OR p."estudanteId" <> c."estudanteId" OR m.valor >= 0)
  ) THEN RAISE EXCEPTION 'Cobrança de teste sem participação ou carteira correspondente'; END IF;
END $$;

CREATE TEMP TABLE "_CiclosCarteira" ON COMMIT DROP AS
SELECT m.id, e."participacaoId",
  (row_number() OVER (PARTITION BY e."participacaoId" ORDER BY m."criadoEm", m.id) +
   GREATEST(p."cicloConfirmacao", COALESCE((SELECT max(x."cicloConfirmacao") FROM "MovimentacaoCarteira" x WHERE x."participacaoId" = p.id), 0)))::integer AS ciclo
FROM "MovimentacaoCarteira" m JOIN "Embarque" e ON e.id = m."embarqueId"
JOIN "ParticipacaoTrecho" p ON p.id = e."participacaoId" WHERE m.tipo = 'COBRANCA_EMBARQUE';
UPDATE "MovimentacaoCarteira" m SET tipo = 'COBRANCA_CONFIRMACAO', "participacaoId" = c."participacaoId", "cicloConfirmacao" = c.ciclo,
  motivo = concat_ws(' | ', m.motivo, 'Conversão de cobrança de teste originalmente registrada no embarque')
FROM "_CiclosCarteira" c WHERE c.id = m.id;
UPDATE "MovimentacaoCarteira" m SET "participacaoId" = c."participacaoId", "cicloConfirmacao" = c.ciclo
FROM "_CiclosCarteira" c WHERE c.id = m."movimentacaoOriginalId";
UPDATE "ParticipacaoTrecho" p SET "cicloConfirmacao" = c.ciclo
FROM (SELECT "participacaoId", max(ciclo) AS ciclo FROM "_CiclosCarteira" GROUP BY "participacaoId") c WHERE c."participacaoId" = p.id;

ALTER TYPE "TipoMovimentacao" RENAME TO "TipoMovimentacaoAnterior";
CREATE TYPE "TipoMovimentacao" AS ENUM ('RECARGA', 'COBRANCA_CONFIRMACAO', 'ESTORNO');
ALTER TABLE "MovimentacaoCarteira" ALTER COLUMN tipo TYPE "TipoMovimentacao" USING tipo::text::"TipoMovimentacao";
DROP TYPE "TipoMovimentacaoAnterior";

ALTER TABLE "Recarga" ADD COLUMN "solicitadaPorId" UUID;
ALTER TABLE "Recarga" ADD CONSTRAINT "Recarga_solicitadaPorId_fkey" FOREIGN KEY ("solicitadaPorId") REFERENCES "Usuario"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Recarga_solicitadaPorId_idx" ON "Recarga"("solicitadaPorId");
CREATE UNIQUE INDEX "Estudante_unidadeEnsinoId_matricula_key" ON "Estudante"("unidadeEnsinoId", matricula);
INSERT INTO "Carteira" (id, "estudanteId", saldo, "limiteCredito", versao, "criadoEm", "atualizadoEm")
SELECT gen_random_uuid(), e.id, 0.00, 20.00, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Estudante" e WHERE NOT EXISTS (SELECT 1 FROM "Carteira" c WHERE c."estudanteId" = e.id);
ALTER TABLE "Carteira" ADD CONSTRAINT "Carteira_limites_check" CHECK ("limiteCredito" = 20.00 AND saldo >= -20.00 AND versao >= 0);
ALTER TABLE "Recarga" ADD CONSTRAINT "Recarga_valor_check" CHECK (valor >= 2.00);
ALTER TABLE "MovimentacaoCarteira" ADD CONSTRAINT "MovimentacaoCarteira_valor_check" CHECK (
  (tipo = 'RECARGA' AND valor > 0 AND "recargaId" IS NOT NULL) OR
  (tipo = 'COBRANCA_CONFIRMACAO' AND valor < 0 AND "participacaoId" IS NOT NULL AND "cicloConfirmacao" > 0) OR
  (tipo = 'ESTORNO' AND valor <> 0 AND "movimentacaoOriginalId" IS NOT NULL)
);
CREATE FUNCTION impedir_edicao_movimentacao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Movimentações financeiras não podem ser editadas ou excluídas';
END $$;
CREATE TRIGGER movimentacao_somente_inclusao BEFORE UPDATE OR DELETE ON "MovimentacaoCarteira"
FOR EACH ROW EXECUTE FUNCTION impedir_edicao_movimentacao();
COMMIT;
