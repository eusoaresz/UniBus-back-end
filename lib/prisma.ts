import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("A variável de ambiente DATABASE_URL não foi definida.");
}

const adapter = new PrismaPg({ connectionString: databaseUrl });

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    // Logs de consultas/erros podem carregar documentos e parâmetros pessoais.
    log: [],
    // Confirmar presença faz ~25 consultas numa transação Serializable. Com a API no Render (EUA) e o
    // banco na Neon (São Paulo), cada ida e volta custa ~0,2 s e o limite padrão de 5 s estoura (P2028 → 500).
    transactionOptions: { maxWait: 10_000, timeout: 20_000 },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
