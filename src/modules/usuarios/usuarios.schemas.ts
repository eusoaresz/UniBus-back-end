import { z } from "zod";

function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let tamanho = 9; tamanho <= 10; tamanho++) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    if ((resto === 10 ? 0 : resto) !== Number(cpf[tamanho])) return false;
  }
  return true;
}

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const senhaSchema = z.string().min(8).max(72)
  .refine((senha) => Buffer.byteLength(senha, "utf8") <= 72, "Senha excede 72 bytes")
  .regex(/[a-z]/, "Inclua letra minúscula")
  .regex(/[A-Z]/, "Inclua letra maiúscula")
  .regex(/[0-9]/, "Inclua número")
  .regex(/[^a-zA-Z0-9]/, "Inclua símbolo");
const nome = z.string().trim().min(2).max(150);
const telefone = z.string().trim().regex(/^[\d\s()+-]+$/, "Telefone inválido")
  .transform((valor) => valor.replace(/\D/g, ""))
  .pipe(z.string().regex(/^(?:55)?[1-9]{2}\d{8,9}$/, "Informe DDD e telefone"));

export const dataNascimentoSchema = z.iso.date().refine((valor) => {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const hoje = ["year", "month", "day"].map((tipo) => partes.find((p) => p.type === tipo)!.value).join("-");
  return valor <= hoje;
}, "Data de nascimento não pode estar no futuro");

export const criarUsuarioSchema = z.strictObject({
  nome,
  cpf: z.string().trim().regex(/^[\d.\-]+$/).transform((valor) => valor.replace(/\D/g, ""))
    .refine(cpfValido, "CPF inválido"),
  email: emailSchema,
  telefone,
  senha: senhaSchema,
  perfil: z.enum(["ESTUDANTE", "MOTORISTA", "OPERADOR"]),
  dataNascimento: dataNascimentoSchema.nullable().optional(),
});

const dadosAcademicosSchema = z.strictObject({
  curso: z.string().trim().min(2).max(150).nullable().optional(),
  cidadeOrigemId: z.string().uuid().nullable().optional(),
  unidadeEnsinoId: z.string().uuid().optional(),
}).refine((dados) => Object.keys(dados).length > 0, "Informe ao menos um dado acadêmico");

export const atualizarDadosSchema = z.strictObject({
  nome: nome.optional(), telefone: telefone.optional(), email: emailSchema.optional(),
  dataNascimento: dataNascimentoSchema.nullable().optional(),
  estudante: dadosAcademicosSchema.optional(),
  motivo: z.string().trim().min(3).max(1000),
}).refine((dados) => Object.keys(dados).some((campo) => campo !== "motivo"), "Informe ao menos um dado para alteração");
export const atualizarMeSchema = atualizarDadosSchema;
export const motivoPerfilSchema = z.strictObject({ motivo: z.string().trim().min(3).max(1000) });
export const listarUsuariosSchema = z.strictObject({
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  perfil: z.enum(["ESTUDANTE", "MOTORISTA", "OPERADOR"]).optional(),
  status: z.enum(["AGUARDANDO_ATIVACAO", "ATIVA", "BLOQUEADA", "INATIVA"]).optional(),
});
export const idSchema = z.string().uuid();
export const statusSchema = z.strictObject({ status: z.enum(["ATIVA", "BLOQUEADA", "INATIVA"]) });
