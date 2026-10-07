import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/password";
const planos = [
    {
        nome_plano: "Performance",
        descricao: "Acompanhamento completo",
        duracao_meses: 3,
        valor_plano: 289.9,
        ativo: true,
    },
    {
        nome_plano: "Essencial",
        descricao: "Treinos personalizados",
        duracao_meses: 1,
        valor_plano: 149.9,
        ativo: true,
    },
];

const instrutores = [
    {
        nome: "Rafael Costa",
        email: "rafael@movimente.com",
        senha: hashPassword("123456"),
        telefone: "11999999999",
        especialidade: "Musculação",
        ativo: true,
        foto: "https://i.pravatar.cc/100?img=13",
    },
];

async function main() {
    try {
        await prisma.pagamento.deleteMany();
        await prisma.treino.deleteMany();
        await prisma.aluno.deleteMany();
        await prisma.instrutor.deleteMany();
        await prisma.plano.deleteMany();

        const planosCriados = await Promise.all(
            planos.map((plano) => prisma.plano.create({ data: plano })),
        );
        const instrutoresCriados = await Promise.all(
            instrutores.map((instrutor) => prisma.instrutor.create({ data: instrutor })),
        );

        const alunos = await Promise.all([
            prisma.aluno.create({
                data: {
                    nome: "Marina Oliveira",
                    data_nascimento: 1995,
                    email: "marina.oliveira@email.com",
                    telefone: "11987654321",
                    data_cadastro: "2026-09-01",
                    foto: "https://i.pravatar.cc/100?img=47",
                    id_plano: planosCriados[0].id_plano,
                },
            }),
            prisma.aluno.create({
                data: {
                    nome: "Lucas Mendes",
                    data_nascimento: 1998,
                    email: "lucas@email.com",
                    telefone: "11976543210",
                    data_cadastro: "2026-09-03",
                    foto: "https://i.pravatar.cc/100?img=12",
                    id_plano: planosCriados[1].id_plano,
                },
            }),
        ]);

        const agora = new Date();
        const vencimento = new Date("2026-09-12T00:00:00.000Z");

        await prisma.treino.create({
            data: {
                id_aluno: alunos[0].id_aluno,
                id_instrutor: instrutoresCriados[0].id_instrutor,
                objetivo: "Hipertrofia",
                observacoes: "Treino A/B, 4x por semana.",
                data_entrada: agora,
                data_saida: agora,
            },
        });

        await prisma.pagamento.createMany({
            data: [
                {
                    id_aluno: alunos[0].id_aluno,
                    id_plano: planosCriados[0].id_plano,
                    data_vencimento: vencimento,
                    valor: planosCriados[0].valor_plano,
                    metodo: "PIX",
                    status_pagamento: "Pago",
                },
                {
                    id_aluno: alunos[1].id_aluno,
                    id_plano: planosCriados[1].id_plano,
                    data_vencimento: new Date("2026-09-14T00:00:00.000Z"),
                    valor: planosCriados[1].valor_plano,
                    metodo: "Cartao",
                    status_pagamento: "Pendente",
                },
            ],
        });

        console.log("Seed da academia concluído: 2 planos, 1 instrutor, 2 alunos, 1 treino e 2 pagamentos.");
    } catch (error) {
        console.error("Erro no seed da academia:", error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

await main();