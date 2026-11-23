BEGIN;

LOCK TABLE "Viagem", "TrechoViagem", "AtendimentoTrecho", "AlteracaoAtendimento", "EscalaSemanal",
  "ParticipacaoTrecho", "Embarque", "IndisponibilidadeMotorista", "SolicitacaoReserva",
  "Carteira", "Recarga", "MovimentacaoCarteira" IN ACCESS EXCLUSIVE MODE;

CREATE TEMP TABLE "_HistoricoViagensMigracao" ON COMMIT DROP AS
SELECT t.id AS "trechoId", jsonb_build_object('trecho', to_jsonb(t), 'viagem', to_jsonb(v),
  'escala', (SELECT to_jsonb(e) FROM "EscalaSemanal" e WHERE e.id = v."escalaSemanalId"),
  'atendimentos', COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM "AtendimentoTrecho" a WHERE a."trechoId" = t.id), '[]'::jsonb),
  'participacoes', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM "ParticipacaoTrecho" p WHERE p."trechoId" = t.id), '[]'::jsonb),
  'embarques', COALESCE((SELECT jsonb_agg(to_jsonb(e)) FROM "Embarque" e JOIN "ParticipacaoTrecho" p ON p.id = e."participacaoId" WHERE p."trechoId" = t.id), '[]'::jsonb)
) AS dados FROM "TrechoViagem" t JOIN "Viagem" v ON v.id = t."viagemId";

CREATE TYPE "AlocacaoVeiculo" AS ENUM ('VEICULO', 'EXTRA');
CREATE TYPE "OrigemConfirmacao" AS ENUM ('ESTUDANTE', 'AUTOMATICA', 'OPERADOR');
ALTER TYPE "StatusParticipacao" RENAME TO "StatusParticipacaoAnterior";
CREATE TYPE "StatusParticipacao" AS ENUM ('EM_ESPERA', 'EXPIRADA', 'CONFIRMADA', 'CANCELADA');
ALTER TABLE "ParticipacaoTrecho" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ParticipacaoTrecho" ALTER COLUMN "status" TYPE "StatusParticipacao" USING "status"::text::"StatusParticipacao";
ALTER TABLE "ParticipacaoTrecho" ALTER COLUMN "status" SET DEFAULT 'EM_ESPERA';
DROP TYPE "StatusParticipacaoAnterior";
ALTER TYPE "TipoMovimentacao" ADD VALUE 'COBRANCA_CONFIRMACAO';
ALTER TYPE "AcaoParticipacao" ADD VALUE 'ENTRADA_FILA';
ALTER TYPE "AcaoParticipacao" ADD VALUE 'EXPIRACAO';

CREATE TABLE IF NOT EXISTS "_ViagemHorariosMigracao" (
  "trechoId" UUID PRIMARY KEY,
  "saidaPrevistaEm" TIMESTAMPTZ(3),
  "chegadaPrevistaEm" TIMESTAMPTZ(3) NOT NULL
);

ALTER TABLE "TrechoViagem"
  ADD COLUMN "chegadaPrevistaEm" TIMESTAMPTZ(3),
  ADD COLUMN "capacidade" INTEGER,
  ADD COLUMN "capacidadeExtra" INTEGER,
  ADD COLUMN "inscricoesSuspensas" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "motoristaId" UUID,
  ADD COLUMN "motoristaExtraId" UUID,
  ADD COLUMN "veiculoId" UUID,
  ADD COLUMN "veiculoExtraId" UUID;

UPDATE "TrechoViagem" t SET
  "saidaPrevistaEm" = COALESCE(t."saidaPrevistaEm", h."saidaPrevistaEm"),
  "chegadaPrevistaEm" = h."chegadaPrevistaEm"
FROM "_ViagemHorariosMigracao" h WHERE h."trechoId" = t.id;

UPDATE "TrechoViagem" t SET "chegadaPrevistaEm" = v."chegadaPedroPrevistaEm"
FROM "Viagem" v WHERE v.id = t."viagemId" AND t.sentido = 'VOLTA' AND t."chegadaPrevistaEm" IS NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "TrechoViagem" WHERE "saidaPrevistaEm" IS NULL OR "chegadaPrevistaEm" IS NULL OR "chegadaPrevistaEm" <= "saidaPrevistaEm") THEN
    RAISE EXCEPTION 'Informe horários válidos e revisados em _ViagemHorariosMigracao antes de migrar viagens existentes';
  END IF;
  IF EXISTS (SELECT 1 FROM "Viagem" v LEFT JOIN "TrechoViagem" t ON t."viagemId" = v.id GROUP BY v.id HAVING count(t.id) <> 2) THEN
    RAISE EXCEPTION 'Cada viagem existente precisa ter ida e volta antes da migração';
  END IF;
  IF EXISTS (SELECT 1 FROM "TrechoViagem" i JOIN "TrechoViagem" v ON v."viagemId" = i."viagemId" AND v.sentido = 'VOLTA' WHERE i.sentido = 'IDA' AND v."saidaPrevistaEm" < i."chegadaPrevistaEm") THEN
    RAISE EXCEPTION 'Há sobreposição entre ida e volta';
  END IF;
  IF EXISTS (SELECT 1 FROM "AtendimentoTrecho" WHERE status <> 'CANCELADO' GROUP BY "trechoId", tipo HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Resolva as múltiplas alocações do mesmo tipo antes da migração';
  END IF;
  IF EXISTS (SELECT 1 FROM "ParticipacaoTrecho" p JOIN "AtendimentoTrecho" a ON a.id = p."atendimentoId" WHERE p.status = 'CONFIRMADA' AND (a.status = 'CANCELADO' OR a."trechoId" <> p."trechoId")) THEN
    RAISE EXCEPTION 'Há participação confirmada com alocação incompatível';
  END IF;
END $$;

UPDATE "TrechoViagem" SET
  "limiteConfirmacaoEm" = "saidaPrevistaEm" - interval '1 hour',
  "limiteCancelamentoEm" = "saidaPrevistaEm" - interval '1 hour',
  "inscricoesSuspensas" = status = 'FECHADO';

UPDATE "TrechoViagem" t SET "motoristaId" = a."motoristaId", "veiculoId" = a."veiculoId", capacidade = a.capacidade
FROM "AtendimentoTrecho" a WHERE a."trechoId" = t.id AND a.tipo = 'PRINCIPAL' AND a.status <> 'CANCELADO';
UPDATE "TrechoViagem" t SET "motoristaExtraId" = a."motoristaId", "veiculoExtraId" = a."veiculoId", "capacidadeExtra" = a.capacidade
FROM "AtendimentoTrecho" a WHERE a."trechoId" = t.id AND a.tipo = 'RESERVA' AND a.status <> 'CANCELADO';

ALTER TABLE "TrechoViagem" ALTER COLUMN "saidaPrevistaEm" SET NOT NULL,
  ALTER COLUMN "chegadaPrevistaEm" SET NOT NULL,
  ALTER COLUMN "limiteConfirmacaoEm" SET NOT NULL,
  ALTER COLUMN "limiteCancelamentoEm" SET NOT NULL;

ALTER TABLE "TrechoViagem" RENAME COLUMN "tarifaCentavos" TO "tarifa";
ALTER TABLE "TrechoViagem" ALTER COLUMN tarifa DROP DEFAULT,
  ALTER COLUMN tarifa TYPE DECIMAL(10,2) USING tarifa::numeric / 100,
  ALTER COLUMN tarifa SET DEFAULT 2.00;
ALTER TABLE "Carteira" RENAME COLUMN "saldoCentavos" TO saldo;
ALTER TABLE "Carteira" RENAME COLUMN "limiteCreditoCentavos" TO "limiteCredito";
ALTER TABLE "Carteira" ALTER COLUMN saldo DROP DEFAULT,
  ALTER COLUMN saldo TYPE DECIMAL(10,2) USING saldo::numeric / 100,
  ALTER COLUMN saldo SET DEFAULT 0.00,
  ALTER COLUMN "limiteCredito" DROP DEFAULT,
  ALTER COLUMN "limiteCredito" TYPE DECIMAL(10,2) USING "limiteCredito"::numeric / 100,
  ALTER COLUMN "limiteCredito" SET DEFAULT 20.00;
ALTER TABLE "Recarga" RENAME COLUMN "valorCentavos" TO valor;
ALTER TABLE "Recarga" ALTER COLUMN valor TYPE DECIMAL(10,2) USING valor::numeric / 100;
ALTER TABLE "MovimentacaoCarteira" RENAME COLUMN "valorCentavos" TO valor;
ALTER TABLE "MovimentacaoCarteira" RENAME COLUMN "saldoAposCentavos" TO "saldoApos";
ALTER TABLE "MovimentacaoCarteira" ALTER COLUMN valor TYPE DECIMAL(10,2) USING valor::numeric / 100,
  ALTER COLUMN "saldoApos" TYPE DECIMAL(10,2) USING "saldoApos"::numeric / 100,
  ADD COLUMN "participacaoId" UUID,
  ADD COLUMN "cicloConfirmacao" INTEGER;

ALTER TABLE "ParticipacaoTrecho"
  ADD COLUMN alocacao "AlocacaoVeiculo",
  ADD COLUMN "origemConfirmacao" "OrigemConfirmacao",
  ADD COLUMN "confirmadaPorId" UUID,
  ADD COLUMN "motivoExcecao" TEXT,
  ADD COLUMN "limiteEstornoEm" TIMESTAMPTZ(3),
  ADD COLUMN "cicloConfirmacao" INTEGER NOT NULL DEFAULT 0,
  ALTER COLUMN "confirmadaEm" DROP NOT NULL,
  ALTER COLUMN "confirmadaEm" DROP DEFAULT;
UPDATE "ParticipacaoTrecho" p SET alocacao = CASE a.tipo WHEN 'PRINCIPAL' THEN 'VEICULO'::"AlocacaoVeiculo" ELSE 'EXTRA'::"AlocacaoVeiculo" END
FROM "AtendimentoTrecho" a WHERE a.id = p."atendimentoId";

ALTER TABLE "SolicitacaoReserva" ADD COLUMN "atendidaEm" TIMESTAMPTZ(3), ADD COLUMN "atendidaPorId" UUID;
UPDATE "SolicitacaoReserva" s SET "atendidaEm" = a."criadoEm" FROM "AtendimentoTrecho" a WHERE a."solicitacaoReservaId" = s.id;

ALTER TABLE "AlteracaoAtendimento" RENAME TO "AlteracaoTrecho";
ALTER TABLE "AlteracaoTrecho" RENAME CONSTRAINT "AlteracaoAtendimento_pkey" TO "AlteracaoTrecho_pkey";
ALTER TABLE "AlteracaoTrecho" RENAME CONSTRAINT "AlteracaoAtendimento_realizadaPorId_fkey" TO "AlteracaoTrecho_realizadaPorId_fkey";
ALTER INDEX "AlteracaoAtendimento_realizadaPorId_idx" RENAME TO "AlteracaoTrecho_realizadaPorId_idx";
ALTER TABLE "AlteracaoTrecho" ADD COLUMN "trechoId" UUID, ADD COLUMN alocacao "AlocacaoVeiculo";
ALTER TABLE "AlteracaoTrecho" ALTER COLUMN "realizadaPorId" DROP NOT NULL;
UPDATE "AlteracaoTrecho" h SET "trechoId" = a."trechoId",
  alocacao = CASE a.tipo WHEN 'PRINCIPAL' THEN 'VEICULO'::"AlocacaoVeiculo" ELSE 'EXTRA'::"AlocacaoVeiculo" END,
  "dadosAnteriores" = jsonb_build_object('registroOriginal', h."dadosAnteriores", 'atendimentoMigrado', to_jsonb(a))
FROM "AtendimentoTrecho" a WHERE a.id = h."atendimentoId";
ALTER TABLE "AlteracaoTrecho" ALTER COLUMN "trechoId" SET NOT NULL, DROP COLUMN "atendimentoId";

INSERT INTO "AlteracaoTrecho" (id, motivo, "dadosAnteriores", "dadosNovos", "criadoEm", "atualizadoEm", "trechoId", "realizadaPorId")
SELECT gen_random_uuid(), 'Preservação dos registros anteriores na migração de viagens',
  h.dados, jsonb_build_object('migracao', '20261027000100_viagens_rascunhos'),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, h."trechoId", NULL
FROM "_HistoricoViagensMigracao" h;

ALTER TABLE "IndisponibilidadeMotorista" ADD COLUMN "trechoId" UUID, ADD COLUMN alocacao "AlocacaoVeiculo";
UPDATE "IndisponibilidadeMotorista" i SET "trechoId" = a."trechoId",
  alocacao = CASE a.tipo WHEN 'PRINCIPAL' THEN 'VEICULO'::"AlocacaoVeiculo" ELSE 'EXTRA'::"AlocacaoVeiculo" END
FROM "AtendimentoTrecho" a WHERE a.id = i."atendimentoId";
ALTER TABLE "IndisponibilidadeMotorista" ALTER COLUMN "trechoId" SET NOT NULL, DROP COLUMN "atendimentoId";
ALTER TABLE "ParticipacaoTrecho" DROP COLUMN "atendimentoId";
ALTER TABLE "Embarque" DROP COLUMN "atendimentoId";
DROP TABLE "AtendimentoTrecho";
DROP TYPE "TipoAtendimento";
DROP TYPE "StatusAtendimento";
ALTER TABLE "Viagem" DROP COLUMN "chegadaPedroPrevistaEm";
ALTER TABLE "TrechoViagem" DROP COLUMN "percentualVagasLivresReserva";
ALTER TABLE "EscalaSemanal" DROP COLUMN "percentualVagasLivresReserva";
DROP TABLE "_ViagemHorariosMigracao";

CREATE INDEX "AlteracaoTrecho_trechoId_idx" ON "AlteracaoTrecho"("trechoId");
CREATE INDEX "TrechoViagem_motoristaId_idx" ON "TrechoViagem"("motoristaId");
CREATE INDEX "TrechoViagem_motoristaExtraId_idx" ON "TrechoViagem"("motoristaExtraId");
CREATE INDEX "TrechoViagem_veiculoId_idx" ON "TrechoViagem"("veiculoId");
CREATE INDEX "TrechoViagem_veiculoExtraId_idx" ON "TrechoViagem"("veiculoExtraId");
CREATE INDEX "SolicitacaoReserva_atendidaPorId_idx" ON "SolicitacaoReserva"("atendidaPorId");
CREATE INDEX "ParticipacaoTrecho_confirmadaPorId_idx" ON "ParticipacaoTrecho"("confirmadaPorId");
CREATE UNIQUE INDEX "MovimentacaoCarteira_participacaoId_cicloConfirmacao_tipo_key" ON "MovimentacaoCarteira"("participacaoId", "cicloConfirmacao", tipo);
CREATE INDEX "IndisponibilidadeMotorista_trechoId_idx" ON "IndisponibilidadeMotorista"("trechoId");

ALTER TABLE "TrechoViagem" ADD CONSTRAINT "TrechoViagem_motoristaId_fkey" FOREIGN KEY ("motoristaId") REFERENCES "Motorista"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrechoViagem" ADD CONSTRAINT "TrechoViagem_motoristaExtraId_fkey" FOREIGN KEY ("motoristaExtraId") REFERENCES "Motorista"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrechoViagem" ADD CONSTRAINT "TrechoViagem_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "Veiculo"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrechoViagem" ADD CONSTRAINT "TrechoViagem_veiculoExtraId_fkey" FOREIGN KEY ("veiculoExtraId") REFERENCES "Veiculo"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlteracaoTrecho" ADD CONSTRAINT "AlteracaoTrecho_trechoId_fkey" FOREIGN KEY ("trechoId") REFERENCES "TrechoViagem"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SolicitacaoReserva" ADD CONSTRAINT "SolicitacaoReserva_atendidaPorId_fkey" FOREIGN KEY ("atendidaPorId") REFERENCES "Usuario"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParticipacaoTrecho" ADD CONSTRAINT "ParticipacaoTrecho_confirmadaPorId_fkey" FOREIGN KEY ("confirmadaPorId") REFERENCES "Usuario"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimentacaoCarteira" ADD CONSTRAINT "MovimentacaoCarteira_participacaoId_fkey" FOREIGN KEY ("participacaoId") REFERENCES "ParticipacaoTrecho"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndisponibilidadeMotorista" ADD CONSTRAINT "IndisponibilidadeMotorista_trechoId_fkey" FOREIGN KEY ("trechoId") REFERENCES "TrechoViagem"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TrechoViagem"
  ADD CONSTRAINT "TrechoViagem_horarios_check" CHECK ("chegadaPrevistaEm" > "saidaPrevistaEm"),
  ADD CONSTRAINT "TrechoViagem_tarifa_check" CHECK (tarifa >= 0),
  ADD CONSTRAINT "TrechoViagem_capacidade_check" CHECK (capacidade > 0 AND "capacidadeExtra" > 0),
  ADD CONSTRAINT "TrechoViagem_extra_check" CHECK (("motoristaExtraId" IS NULL) = ("veiculoExtraId" IS NULL)),
  ADD CONSTRAINT "TrechoViagem_recursos_check" CHECK ("motoristaId" <> "motoristaExtraId" AND "veiculoId" <> "veiculoExtraId");

COMMIT;
