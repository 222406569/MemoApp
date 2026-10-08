import type Database from "@tauri-apps/plugin-sql";
import { getDb, withTransaction } from "./client";
import { formatLocalDateTime, type Item, type ItemBatchPatch, type ItemFilters, type ItemWrite, type SortRule } from "./types";

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function sortExpression(rule: SortRule): string {
  const column =
    rule.field === "customer"
      ? "c.sort_priority"
      : rule.field === "status"
        ? "s.sort_priority"
        : `i.${rule.field}`;
  const nullFlag = rule.nulls === "first" ? `${column} IS NOT NULL` : `${column} IS NULL`;
  const dir = rule.direction === "desc" ? "DESC" : "ASC";
  return `${nullFlag}, ${column} ${dir}`;
}

export function buildItemWhere(
  filters: ItemFilters,
  startIndex = 1
): { sql: string; params: unknown[]; nextIndex: number } {
  const clauses: string[] = ["1 = 1"];
  const params: unknown[] = [];
  let i = startIndex;

  if (filters.customerName.trim()) {
    clauses.push(`c.name LIKE $${i} ESCAPE '\\'`);
    params.push(`%${escapeLike(filters.customerName.trim())}%`);
    i += 1;
  }
  if (filters.title.trim()) {
    clauses.push(`i.title LIKE $${i} ESCAPE '\\'`);
    params.push(`%${escapeLike(filters.title.trim())}%`);
    i += 1;
  }
  if (filters.detail.trim()) {
    clauses.push(`i.detail LIKE $${i} ESCAPE '\\'`);
    params.push(`%${escapeLike(filters.detail.trim())}%`);
    i += 1;
  }
  if (filters.createdFrom) {
    clauses.push(`i.created_at >= $${i}`);
    params.push(filters.createdFrom);
    i += 1;
  }
  if (filters.createdTo) {
    clauses.push(`i.created_at <= $${i}`);
    params.push(filters.createdTo);
    i += 1;
  }
  if (filters.requiredFrom) {
    clauses.push(`i.required_at IS NOT NULL AND i.required_at >= $${i}`);
    params.push(filters.requiredFrom);
    i += 1;
  }
  if (filters.requiredTo) {
    clauses.push(`i.required_at IS NOT NULL AND i.required_at <= $${i}`);
    params.push(filters.requiredTo);
    i += 1;
  }
  if (filters.excludedStatusIds.length > 0) {
    const placeholders = filters.excludedStatusIds.map((_, idx) => `$${i + idx}`).join(", ");
    clauses.push(`(i.status_id IS NULL OR i.status_id NOT IN (${placeholders}))`);
    params.push(...filters.excludedStatusIds);
    i += filters.excludedStatusIds.length;
  }

  return { sql: clauses.join(" AND "), params, nextIndex: i };
}

const ITEM_SELECT = `
SELECT
  i.id,
  i.customer_id,
  i.status_id,
  i.created_at,
  i.required_at,
  i.title,
  i.detail,
  i.reminded,
  c.name AS customer_name,
  s.name AS status_name
FROM items i
LEFT JOIN customers c ON c.id = i.customer_id
LEFT JOIN statuses s ON s.id = i.status_id
`;

export async function listItems(filters: ItemFilters, sortRules: SortRule[]): Promise<Item[]> {
  const db = await getDb();
  const where = buildItemWhere(filters);
  const order =
    sortRules.length > 0
      ? sortRules.map(sortExpression).join(", ")
      : "i.created_at DESC";
  return db.select<Item[]>(`${ITEM_SELECT} WHERE ${where.sql} ORDER BY ${order}`, where.params);
}

export async function getItem(id: number): Promise<Item | null> {
  const db = await getDb();
  const rows = await db.select<Item[]>(`${ITEM_SELECT} WHERE i.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createItem(data: ItemWrite): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO items (customer_id, status_id, created_at, required_at, title, detail, reminded)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      data.customer_id,
      data.status_id,
      formatLocalDateTime(new Date()),
      data.required_at,
      data.title,
      data.detail,
      data.reminded,
    ]
  );
  return Number(result.lastInsertId);
}

export async function updateItem(id: number, data: ItemWrite): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE items
     SET customer_id = $1, status_id = $2, required_at = $3, title = $4, detail = $5, reminded = $6
     WHERE id = $7`,
    [data.customer_id, data.status_id, data.required_at, data.title, data.detail, data.reminded, id]
  );
}

export async function deleteItems(ids: number[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const db = await getDb();
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  await db.execute(`DELETE FROM items WHERE id IN (${placeholders})`, ids);
}

export async function batchUpdateItems(ids: number[], patch: ItemBatchPatch): Promise<void> {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (ids.length === 0 || entries.length === 0) {
    return;
  }
  await withTransaction(async (db: Database) => {
    const setSql = entries.map(([key], idx) => `${key} = $${idx + 1}`).join(", ");
    const values = entries.map(([, value]) => value);
    const idPlaceholders = ids.map((_, idx) => `$${entries.length + idx + 1}`).join(", ");
    await db.execute(
      `UPDATE items SET ${setSql} WHERE id IN (${idPlaceholders})`,
      [...values, ...ids]
    );
  });
}

export async function markReminded(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE items SET reminded = 1 WHERE id = $1", [id]);
}
