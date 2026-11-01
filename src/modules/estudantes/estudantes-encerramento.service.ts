import { transacaoPerfil } from "../usuarios/usuarios-dados.service";
import { HttpError } from "../../shared/errors/http-error";
import { cancelarTx } from "../operacao/operacao.shared";
import { promoverTx } from "../operacao/participacoes.service";
import { estudanteDetalheDto, estudanteDetalheSelect } from "./estudantes.dto";
import { validarUnidade } from "./estudantes.service";

export function alterarEncerramento(id: string, operadorId: string, motivo: string, reabrir = false) {
  return transacaoPerfil(operadorId, async tx => {
    const estudante = await tx.estudante.findUnique({ where: { id }, include: { usuario: { select: { perfil: true } }, carteira: true } });
    if (!estudante) throw new HttpError(404, "Cadastro acadêmico não encontrado");
    if (estudante.usuario.perfil !== "ESTUDANTE") throw new HttpError(409, "Conta sem perfil de estudante");
    if (reabrir) {
      if (estudante.statusCadastro !== "ENCERRADO") throw new HttpError(409, "Somente cadastro encerrado pode ser reaberto");
      await validarUnidade(tx, estudante.unidadeEnsinoId);
    } else {
      if (estudante.statusCadastro === "ENCERRADO") return estudanteDetalheDto(await tx.estudante.findUniqueOrThrow({ where: { id }, select: estudanteDetalheSelect }));
      if (await tx.recarga.findFirst({ where: { carteira: { estudanteId: id }, status: "PENDENTE" }, select: { id: true } })) throw new HttpError(409, "Resolva as recargas pendentes antes de encerrar");
      if (await tx.participacaoTrecho.findFirst({ where: { estudanteId: id, status: "CONFIRMADA", trecho: { status: "EM_ANDAMENTO" } }, select: { id: true } })) throw new HttpError(409, "Aguarde a conclusão do trecho em andamento antes de encerrar");
    }
    const statusCadastro = reabrir ? "APROVADO" : "ENCERRADO";
    await tx.estudante.update({ where: { id }, data: { statusCadastro, analisadoPorId: operadorId, analisadoEm: new Date(), observacaoAnalise: motivo } });
    if (!reabrir) {
      const participacoes = await tx.participacaoTrecho.findMany({ where: { estudanteId: id, OR: [
        { status: "EM_ESPERA" }, { status: "CONFIRMADA", trecho: { status: { in: ["RASCUNHO", "ABERTO", "FECHADO"] }, iniciadoEm: null } },
      ] } });
      for (const p of participacoes) await cancelarTx(tx, p.id, operadorId, motivo);
      for (const trechoId of new Set(participacoes.map(p => p.trechoId))) await promoverTx(tx, trechoId, new Date());
    }
    await tx.alteracaoPerfil.create({ data: { usuarioId: estudante.usuarioId, realizadaPorId: operadorId, motivo,
      dadosAnteriores: { estudanteId: id, statusCadastro: estudante.statusCadastro }, dadosNovos: { estudanteId: id, statusCadastro } } });
    return estudanteDetalheDto(await tx.estudante.findUniqueOrThrow({ where: { id }, select: estudanteDetalheSelect }));
  });
}
