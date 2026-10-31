import { PGlite } from "@electric-sql/pglite";
import { DriverAdapterError, type SqlDriverAdapter, type SqlQueryable, type Transaction } from "@prisma/driver-adapter-utils";

export function adapterMemoria(db: PGlite) {
  const info = { provider: "postgres" as const, adapterName: "unibus-test-pglite" };
  const tipos: Record<number, number> = { 16: 5, 20: 1, 21: 0, 23: 0, 26: 0, 700: 2, 701: 3, 1700: 4, 1082: 8, 1083: 9, 1114: 10, 1184: 10, 114: 11, 3802: 11, 2950: 15, 17: 13 };
  function consultas(cliente: Pick<PGlite, "query">): SqlQueryable {
    async function executar(q: { sql: string; args: unknown[] }) {
      try {
        return await cliente.query<any[]>(q.sql, q.args, { rowMode: "array",
          parsers: { 20: (v: string) => v, 1700: (v: string) => v, 1082: (v: string) => v, 1114: (v: string) => v, 1184: (v: string) => v, 114: (v: string) => v, 3802: (v: string) => v },
          serializers: { 114: (v: unknown) => typeof v === "string" ? v : JSON.stringify(v), 3802: (v: unknown) => typeof v === "string" ? v : JSON.stringify(v) },
        });
      } catch (e: any) {
        if (e.code === "23505") throw new DriverAdapterError({ kind: "UniqueConstraintViolation", constraint: { index: e.constraint }, originalCode: e.code });
        throw e;
      }
    }
    return { ...info,
      async queryRaw(q) { const r = await executar(q); return { rows: r.rows, columnNames: r.fields.map((f) => f.name), columnTypes: r.fields.map((f) => (tipos[f.dataTypeID] ?? 7) as any) }; },
      async executeRaw(q) { return (await executar(q)).affectedRows ?? 0; },
    };
  }
  return { ...info, async connect(): Promise<SqlDriverAdapter> {
    return { ...consultas(db),
      getConnectionInfo: () => ({ supportsRelationJoins: false }),
      executeScript: async (sql) => { await db.exec(sql); },
      dispose: async () => {},
      startTransaction: async () => {
        let liberar!: (cancelar: boolean) => void;
        let pronta!: (tx: Transaction) => void;
        let falhar!: (erro: unknown) => void;
        const prontaPromise = new Promise<Transaction>((resolve, reject) => { pronta = resolve; falhar = reject; });
        const fim = new Promise<boolean>((resolve) => { liberar = resolve; });
        const execucao = db.transaction(async (tx) => {
          pronta({ ...consultas(tx), options: { usePhantomQuery: true },
            commit: async () => { liberar(false); await execucao; },
            rollback: async () => { liberar(true); await execucao.catch(() => {}); },
          });
          if (await fim) throw new Error("rollback de teste");
        });
        execucao.catch(falhar);
        return prontaPromise;
      },
    };
  } };
}
