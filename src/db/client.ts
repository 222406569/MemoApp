import Database from "@tauri-apps/plugin-sql";

let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:memo.db").then(async (db) => {
      await db.execute("PRAGMA foreign_keys = ON");
      return db;
    });
  }
  return dbPromise;
}

export async function withTransaction<T>(work: (db: Database) => Promise<T>): Promise<T> {
  const db = await getDb();
  await db.execute("BEGIN");
  try {
    const result = await work(db);
    await db.execute("COMMIT");
    return result;
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
}
