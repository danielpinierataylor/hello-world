import postgres from "postgres";

const g = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };
export const sql = g.__sql ?? postgres(process.env.DATABASE_URL!, { max: 8, onnotice: () => {} });
if (process.env.NODE_ENV !== "production") g.__sql = sql;
