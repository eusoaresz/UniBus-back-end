import { z } from "zod";

export const temas = {
  CONFIRMACOES: "confirmacoes", ALTERACOES_ROTA: "alteracoesRota", CANCELAMENTOS: "cancelamentos",
  LEMBRETES: "lembretes", AVISOS_OPERADOR: "avisosOperador", NOVIDADES: "novidades",
  CARTEIRA: "carteira", DISCIPLINA: "disciplina", OPERACAO: "operacao",
} as const;
export type Tema = keyof typeof temas;
export const temaSchema = z.enum(Object.keys(temas) as [Tema, ...Tema[]]);
export const preferenciasPadrao = {
  ativadas: true, confirmacoes: true, alteracoesRota: true, cancelamentos: true, lembretes: true,
  avisosOperador: true, novidades: true, carteira: true, disciplina: true, operacao: true,
};
export const preferenciasSchema = z.strictObject({
  ativadas: z.boolean().optional(), confirmacoes: z.boolean().optional(), alteracoesRota: z.boolean().optional(),
  cancelamentos: z.boolean().optional(), lembretes: z.boolean().optional(), avisosOperador: z.boolean().optional(),
  novidades: z.boolean().optional(), carteira: z.boolean().optional(), disciplina: z.boolean().optional(), operacao: z.boolean().optional(),
}).refine(dados => Object.keys(dados).length > 0, "Informe ao menos uma configuração");
export const listaSchema = z.strictObject({
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  tema: temaSchema.optional(),
  somenteNaoLidas: z.enum(["true", "false"]).transform(v => v === "true").default(false),
});
export const idSchema = z.string().uuid();
