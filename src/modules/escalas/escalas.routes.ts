import { Router } from "express";
import { prisma } from "../../../lib/prisma";
import { verificarToken, exigirOperador } from "../../shared/middlewares/auth";
import { HttpError } from "../../shared/errors/http-error";
import { idSchema } from "../usuarios/usuarios.schemas";
import { executarTransacao } from "../carteira/carteira.financeiro";
import { escalaSchema, editarEscalaSchema, listarEscalasSchema } from "./escalas.schemas";
import type { Prisma } from "../../../generated/prisma";

const router = Router();
router.use(verificarToken, exigirOperador);
const include = { rota: { select: { id: true, nome: true } },
  motorista: { select: { id: true, usuario: { select: { nome: true } } } },
  veiculo: { select: { id: true, identificacao: true, placa: true } } } as const;
async function validar(tx: Prisma.TransactionClient, d: { rotaId: string; motoristaId: string; veiculoId: string; ativa: boolean;
  saidaIdaMinuto?: number | null; saidaVoltaMinuto?: number | null; chegadaPedroMinuto?: number | null;
  saidaVoltaDiaOffset: number; chegadaPedroDiaOffset: number }) {
  const rota = await tx.rota.findUnique({ where: { id: d.rotaId } });
  const motorista = await tx.motorista.findUnique({ where: { id: d.motoristaId }, include: { usuario: true } });
  const veiculo = await tx.veiculo.findUnique({ where: { id: d.veiculoId } });
  if (!rota || !motorista || !veiculo) throw new HttpError(404, "Rota, motorista ou veículo não encontrado");
  if (d.ativa && (!rota.ativa || motorista.usuario.status !== "ATIVA" || motorista.usuario.perfil !== "MOTORISTA" || !veiculo.ativo)) {
    throw new HttpError(409, "Escala ativa exige rota, motorista e veículo ativos");
  }
  const volta = d.saidaVoltaMinuto == null ? null : d.saidaVoltaMinuto + d.saidaVoltaDiaOffset * 1440;
  const chegada = d.chegadaPedroMinuto == null ? null : d.chegadaPedroMinuto + d.chegadaPedroDiaOffset * 1440;
  if ((d.saidaIdaMinuto != null && volta != null && volta <= d.saidaIdaMinuto) || (volta != null && chegada != null && chegada <= volta)) {
    throw new HttpError(400, "Revise a sequência dos horários e os dias seguintes");
  }
}
router.get("/", async (req, res) => {
  const { pagina, limite } = listarEscalasSchema.parse(req.query);
  const dados = await prisma.escalaSemanal.findMany({ skip: (pagina - 1) * limite, take: limite + 1,
    orderBy: [{ diaSemana: "asc" }, { turno: "asc" }, { id: "asc" }], include });
  res.json({ dados: dados.slice(0, limite), meta: { pagina, limite, temProxima: dados.length > limite } });
});
router.get("/:id", async (req, res) => {
  const escala = await prisma.escalaSemanal.findUnique({ where: { id: idSchema.parse(req.params.id) }, include });
  if (!escala) throw new HttpError(404, "Escala não encontrada");
  res.json(escala);
});
router.post("/", async (req, res) => {
  const dados = escalaSchema.parse(req.body);
  res.status(201).json(await executarTransacao(prisma, async tx => {
    await validar(tx, dados);
    return tx.escalaSemanal.create({ data: dados, include });
  }));
});
router.patch("/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id), dados = editarEscalaSchema.parse(req.body);
  res.json(await executarTransacao(prisma, async tx => {
    const atual = await tx.escalaSemanal.findUnique({ where: { id } });
    if (!atual) throw new HttpError(404, "Escala não encontrada");
    await validar(tx, { ...atual, ...dados });
    return tx.escalaSemanal.update({ where: { id }, data: dados, include });
  }));
});
export default router;
