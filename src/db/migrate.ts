import { getDb } from "./client";
import { emptyFilters, type ItemFilters } from "./types";

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sort_priority INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS statuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sort_priority INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER REFERENCES customers(id),
    status_id INTEGER REFERENCES statuses(id),
    created_at TEXT NOT NULL,
    required_at TEXT,
    title TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    reminded INTEGER NOT NULL DEFAULT 0,
    last_reminded_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    stored_path TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS view_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    filters_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sort_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    field TEXT NOT NULL,
    direction TEXT NOT NULL,
    nulls TEXT NOT NULL,
    priority INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS reminder_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    field TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    config_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS reminder_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    interval_minutes INTEGER
  )`,
];

async function hasColumn(table: string, column: string): Promise<boolean> {
  const db = await getDb();
  const cols = await db.select<{ name: string }[]>(`PRAGMA table_info(${table})`);
  return cols.some((col) => col.name === column);
}

async function applyMigration1(): Promise<void> {
  const db = await getDb();
  await db.execute("BEGIN");
  try {
    const seedStatuses = [
      ["代办", 10],
      ["进行中", 20],
      ["完成", 30],
      ["作废", 40],
    ] as const;
    for (const [name, priority] of seedStatuses) {
      await db.execute(
        "INSERT INTO statuses (name, sort_priority) VALUES ($1, $2)",
        [name, priority]
      );
    }

    const hidden = await db.select<{ id: number }[]>(
      "SELECT id FROM statuses WHERE name IN ($1, $2)",
      ["完成", "作废"]
    );
    const filters: ItemFilters = {
      ...emptyFilters(),
      excludedStatusIds: hidden.map((row) => row.id),
    };
    await db.execute(
      "INSERT INTO view_presets (name, is_default, filters_json) VALUES ($1, 1, $2)",
      ["默认", JSON.stringify(filters)]
    );

    await db.execute(
      "INSERT INTO sort_rules (field, direction, nulls, priority) VALUES ($1, $2, $3, $4)",
      ["required_at", "asc", "last", 0]
    );
    await db.execute(
      "INSERT INTO sort_rules (field, direction, nulls, priority) VALUES ($1, $2, $3, $4)",
      ["created_at", "desc", "last", 1]
    );

    await db.execute("INSERT INTO schema_migrations (version) VALUES (1)");
    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
}

async function applyMigration2(): Promise<void> {
  const db = await getDb();
  const needsLastRemindedAt = !(await hasColumn("items", "last_reminded_at"));
  await db.execute("BEGIN");
  try {
    if (needsLastRemindedAt) {
      await db.execute("ALTER TABLE items ADD COLUMN last_reminded_at TEXT");
    }
    await db.execute(
      `CREATE TABLE IF NOT EXISTS reminder_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        interval_minutes INTEGER
      )`
    );
    await db.execute(
      "INSERT OR IGNORE INTO reminder_settings (id, interval_minutes) VALUES (1, NULL)"
    );
    await db.execute("INSERT INTO schema_migrations (version) VALUES (2)");
    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
}

export async function migrate(): Promise<void> {
  const db = await getDb();
  await db.execute("PRAGMA foreign_keys = ON");
  for (const sql of SCHEMA_STATEMENTS) {
    await db.execute(sql);
  }

  const versions = await db.select<{ version: number }[]>(
    "SELECT version FROM schema_migrations ORDER BY version"
  );
  const applied = new Set(versions.map((row) => row.version));

  if (!applied.has(1)) {
    await applyMigration1();
  }
  if (!applied.has(2)) {
    await applyMigration2();
  }
}
