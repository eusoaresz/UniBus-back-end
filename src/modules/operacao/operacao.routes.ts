import { Router, type Response, type RequestHandler } from "express";
import { prisma } from "../../../lib/prisma";
import { verificarToken, exigirOperador, type ReqUsuario } from "../../shared/middlewares/auth";
import { serializar } from "../carteira/carteira.service";
import { HttpError } from "../../shared/errors/http-error";
import * as s from "./operacao.schemas";
import * as recursos from "./recursos.service";
import * as participacoes from "./participacoes.service";
import * as execucao from "./execucao.service";
import * as vans from "./van.service";
import * as disciplina from "./disciplina.service";
import { exigir, participacaoSelect, transacao } from "./operacao.shared";

const router = Router();
router.use(verificarToken);
const responder = (fn: (req: ReqUsuario) => Promise<unknown>, status = 200) => async (req: ReqUsuario, res: Response) => {
  res.status(status).json(serializar(await fn(req)));
};
const id = (req: ReqUsuario) => s.idSchema.parse(req.params.id);
const ator = (req: ReqUsuario) => ({ id: req.usuarioId!, perfil: req.usuarioPerfil! });
const estudante: RequestHandler = (req: ReqUsuario, _res, next) => {
  if (req.usuarioPerfil !== "ESTUDANTE") throw new HttpError(403, "Acesso restrito a estudantes");
  next();
};
const motorista: RequestHandler = (req: ReqUsuario, _res, next) => {
  if (req.usuarioPerfil !== "MOTORISTA") throw new HttpError(403, "Acesso restrito a motoristas");
  next();
};

router.get("/trechos", responder(async (req) => {
  const { pagina, limite } = s.paginaSchema.parse(req.query);
  return prisma.trechoViagem.findMany({ where: { status: { not: "RASCUNHO" } },
    skip: (pagina - 1) * limite, take: limite, orderBy: [{ saidaPrevistaEm: "asc" }, { id: "asc" }],
    select: { id: true, viagemId: true, sentido: true, status: true, saidaPrevistaEm: true, chegadaPrevistaEm: true,
      limiteConfirmacaoEm: true, limiteCancelamentoEm: true, tarifa: true, capacidade: true, capacidadeExtra: true,
      viagem: { select: { nomeRota: true, turno: true } },
      paradas: { orderBy: { ordem: "asc" }, select: { id: true, nome: true, cidade: true, ordem: true } },
      _count: { select: { participacoes: { where: { status: "CONFIRMADA" } } } } },
  });
}));
router.get("/trechos/me", motorista, responder(async (req) => {
  const p = s.paginaSchema.parse(req.query);
  return prisma.trechoViagem.findMany({ where: { status: { not: "RASCUNHO" },
    OR: [{ motorista: { usuarioId: req.usuarioId! } }, { motoristaExtra: { usuarioId: req.usuarioId! } }] },
    skip: (p.pagina - 1) * p.limite, take: p.limite, orderBy: [{ saidaPrevistaEm: "asc" }, { id: "asc" }],
    select: { id: true, viagemId: true, sentido: true, status: true, saidaPrevistaEm: true, chegadaPrevistaEm: true,
      viagem: { select: { nomeRota: true, turno: true } } } });
}));
router.get("/trechos/:id", responder(async (req) => {
  const trecho = await prisma.trechoViagem.findFirst({ where: { id: id(req), status: { not: "RASCUNHO" } },
    select: { id: true, viagemId: true, sentido: true, status: true, tarifa: true,
      saidaPrevistaEm: true, chegadaPrevistaEm: true, limiteConfirmacaoEm: true, limiteCancelamentoEm: true,
      capacidade: true, capacidadeExtra: true, inscricoesSuspensas: true,
      viagem: { select: { nomeRota: true, turno: true } },
      motorista: { select: { usuario: { select: { nome: true } } } },
      motoristaExtra: { select: { usuario: { select: { nome: true } } } },
      veiculo: { select: { identificacao: true, placa: true, tipo: true } },
      veiculoExtra: { select: { identificacao: true, placa: true, tipo: true } },
      paradas: { orderBy: { ordem: "asc" }, select: { id: true, nome: true, cidade: true, endereco: true, referencia: true, ordem: true } },
      _count: { select: { participacoes: { where: { status: "CONFIRMADA" } } } } } });
  exigir(trecho, "Trecho não encontrado", 404);
  return { ...trecho, minhaParticipacao: req.usuarioPerfil === "ESTUDANTE"
    ? await prisma.participacaoTrecho.findFirst({ where: { trechoId: trecho.id, estudante: { usuarioId: req.usuarioId! } }, select: participacaoSelect }) : null };
}));
router.get("/participacoes/minhas", estudante, responder((req) => {
  const p = s.paginaSchema.parse(req.query); return participacoes.minhasParticipacoes(req.usuarioId!, p.pagina, p.limite);
}));
router.post("/trechos/:id/inscricoes", estudante, responder((req) => participacoes.inscrever(id(req), req.usuarioId!, s.inscricaoSchema.parse(req.body))));
router.post("/inscricoes/ida-volta", estudante, responder((req) => participacoes.inscreverDupla(req.usuarioId!, s.inscricaoDuplaSchema.parse(req.body))));
router.post("/participacoes/:id/cancelar", estudante, responder((req) => participacoes.cancelarPropria(id(req), req.usuarioId!)));
router.get("/participacoes/:id/qr", estudante, responder((req) => execucao.gerarQr(id(req), req.usuarioId!)));
router.get("/faltas/minhas", estudante, responder((req) => {
  const p = s.paginaSchema.parse(req.query); return disciplina.minhasFaltas(req.usuarioId!, p.pagina, p.limite);
}));
router.post("/faltas/:id/justificativa", estudante, responder((req) => disciplina.justificarFalta(id(req), req.usuarioId!, s.justificativaSchema.parse(req.body).justificativa)));

router.get("/convocacoes/minhas", motorista, responder(async (req) => {
  const p = s.paginaSchema.parse(req.query);
  return prisma.convocacaoVan.findMany({ where: { motorista: { usuarioId: req.usuarioId! } },
    skip: (p.pagina - 1) * p.limite, take: p.limite, orderBy: [{ criadoEm: "desc" }, { id: "desc" }] });
}));
router.post("/convocacoes/:id/responder", motorista, responder((req) => vans.responderVan(id(req), req.usuarioId!, s.responderVanSchema.parse(req.body).aceitar)));
router.get("/trechos/:id/passageiros", responder((req) => {
  const p = s.paginaSchema.parse(req.query); return execucao.passageiros(id(req), ator(req), p.pagina, p.limite);
}));
router.post("/trechos/:id/embarques", responder((req) => execucao.embarcar(id(req), s.embarqueSchema.parse(req.body), ator(req))));

router.use(exigirOperador);
router.get("/recursos", responder(async () => ({
  motoristas: await prisma.motorista.findMany({ where: { usuario: { status: "ATIVA", perfil: "MOTORISTA" } }, take: 100,
    select: { id: true, validadeCnh: true, categoriaCnh: true, usuario: { select: { nome: true } } } }),
  veiculos: await prisma.veiculo.findMany({ where: { ativo: true }, take: 100,
    select: { id: true, placa: true, identificacao: true, tipo: true, capacidade: true } }),
})));
router.get("/semestres", responder(() => prisma.semestreLetivo.findMany({ orderBy: { inicio: "desc" }, take: 100 })));
router.post("/semestres", responder((req) => disciplina.criarSemestre(s.semestreSchema.parse(req.body), req.usuarioId!), 201));
router.post("/viagens/:id/publicar", responder((req) => recursos.publicar(id(req), req.usuarioId!)));
router.patch("/trechos/:id/recursos", responder((req) => transacao(async (tx) => {
  const atual = await recursos.alocarTx(tx, id(req), s.alocacaoSchema.parse(req.body), req.usuarioId!);
  await participacoes.promoverTx(tx, atual.id, new Date()); return atual;
})));
router.patch("/trechos/:id/horario", responder((req) => execucao.alterarHorario(id(req), s.reabrirSchema.parse(req.body), req.usuarioId!)));
router.get("/trechos/:id/fila", responder(async (req) => {
  const p = s.paginaSchema.parse(req.query);
  return prisma.participacaoTrecho.findMany({ where: { trechoId: id(req), status: "EM_ESPERA" },
    orderBy: { ordemFila: "asc" }, skip: (p.pagina - 1) * p.limite, take: p.limite,
    select: { ...participacaoSelect, estudante: { select: { matricula: true, usuario: { select: { nome: true } } } } } });
}));
router.post("/trechos/:id/confirmacoes", responder((req) => {
  const d = s.confirmarOperadorSchema.parse(req.body); return participacoes.confirmarOperador(id(req), d.estudanteId, req.usuarioId!, d.motivo);
}));
router.post("/trechos/:id/convocacoes", responder((req) => {
  const d = s.convocarSchema.parse(req.body); return vans.solicitarVan(id(req), d.motoristaId, d.veiculoId, d.prazoMinutos, req.usuarioId!);
}, 201));
router.post("/trechos/:id/indisponibilidade", responder((req) => vans.avisarIndisponibilidade(id(req), s.motivoSchema.parse(req.body).motivo, req.usuarioId!)));
router.post("/trechos/:id/cancelar", responder((req) => execucao.cancelarTrecho(id(req), req.usuarioId!, s.motivoSchema.parse(req.body).motivo)));
router.post("/viagens/:id/cancelar", responder((req) => execucao.cancelarViagem(id(req), req.usuarioId!, s.motivoSchema.parse(req.body).motivo)));
router.post("/trechos/:id/iniciar", responder((req) => execucao.iniciar(id(req), req.usuarioId!)));
router.post("/trechos/:id/concluir", responder((req) => execucao.concluir(id(req), req.usuarioId!)));
router.post("/prazos/processar", responder(() => vans.processarPrazos()));
router.post("/faltas/:id/analisar", responder((req) => {
  const d = s.analiseFaltaSchema.parse(req.body); return disciplina.analisarFalta(id(req), req.usuarioId!, d.aprovar, d.motivo);
}));
router.get("/estudantes/:id/disciplina", responder(async (req) => {
  const p = s.paginaSchema.parse(req.query), estudanteId = id(req);
  exigir(await prisma.estudante.findUnique({ where: { id: estudanteId }, select: { id: true } }), "Estudante não encontrado", 404);
  return { faltas: await prisma.falta.findMany({ where: { estudanteId }, skip: (p.pagina - 1) * p.limite, take: p.limite, orderBy: { criadoEm: "desc" } }),
    advertencias: await prisma.advertencia.findMany({ where: { estudanteId }, take: 100, orderBy: { criadoEm: "desc" } }) };
}));
router.post("/estudantes/:id/disciplina/liberar", responder(async (req) => {
  const d = s.liberarDisciplinaSchema.parse(req.body);
  return disciplina.liberarDisciplina(id(req), d.semestreId, req.usuarioId!, d.motivo);
}));

export default router;
