import type Database from "@tauri-apps/plugin-sql";
import { getDb, withTransaction } from "./client";
import {
  formatLocalDateTime,
  parseLocalDateTime,
  type Item,
  type ItemBatchPatch,
  type ItemFilters,
  type ItemWrite,
  type SortRule,
} from "./types";

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
  i.last_reminded_at,
  i.segment_started_at,
  i.elapsed_seconds,
  i.started_at,
  i.finished_at,
  c.name AS customer_name,
  s.name AS status_name
FROM items i
LEFT JOIN customers c ON c.id = i.customer_id
LEFT JOIN statuses s ON s.id = i.status_id
`;

function lastRemindedAtForWrite(reminded: number): string | null {
  return reminded === 1 ? formatLocalDateTime(new Date()) : null;
}

const RUNNING_STATUS = "进行中";
const SETTLE_STATUSES = new Set(["暂停", "完成"]);

type TimingState = {
  segment_started_at: string | null;
  elapsed_seconds: number;
};

export function nextSegmentTiming(
  current: TimingState,
  nextStatusName: string | null,
  now: Date
): TimingState {
  const elapsed = current.elapsed_seconds ?? 0;
  if (nextStatusName === RUNNING_STATUS) {
    return {
      segment_started_at: current.segment_started_at ?? formatLocalDateTime(now),
      elapsed_seconds: elapsed,
    };
  }
  if (nextStatusName != null && SETTLE_STATUSES.has(nextStatusName)) {
    if (!current.segment_started_at) {
      return { segment_started_at: null, elapsed_seconds: elapsed };
    }
    const start = parseLocalDateTime(current.segment_started_at);
    const delta = start == null ? 0 : Math.max(0, Math.floor((now.getTime() - start) / 1000));
    return { segment_started_at: null, elapsed_seconds: elapsed + delta };
  }
  return { segment_started_at: null, elapsed_seconds: elapsed };
}

const DONE_STATUS = "完成";

function presentTime(value: string | null): string | null {
  if (value == null || value.trim() === "") {
    return null;
  }
  return value;
}

export function nextMarkedTimes(
  previousStatusName: string | null,
  nextStatusName: string | null,
  startedAt: string | null,
  finishedAt: string | null,
  now: Date
): { started_at: string | null; finished_at: string | null } {
  const started = presentTime(startedAt);
  const finished = presentTime(finishedAt);
  if (nextStatusName === previousStatusName) {
    return { started_at: started, finished_at: finished };
  }
  if (nextStatusName === RUNNING_STATUS) {
    return {
      started_at: started ?? formatLocalDateTime(now),
      finished_at: null,
    };
  }
  if (nextStatusName === DONE_STATUS) {
    return {
      started_at: started,
      finished_at: finished ?? formatLocalDateTime(now),
    };
  }
  return { started_at: started, finished_at: finished };
}

async function statusName(db: Database, statusId: number | null): Promise<string | null> {
  if (statusId == null) {
    return null;
  }
  const rows = await db.select<{ name: string }[]>("SELECT name FROM statuses WHERE id = $1", [
    statusId,
  ]);
  return rows[0]?.name ?? null;
}

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
  const now = new Date();
  const nextName = await statusName(db, data.status_id);
  const timing = nextSegmentTiming(
    { segment_started_at: null, elapsed_seconds: 0 },
    nextName,
    now
  );
  const marked = nextMarkedTimes(null, nextName, data.started_at, data.finished_at, now);
  const result = await db.execute(
    `INSERT INTO items (
       customer_id, status_id, created_at, required_at, title, detail, reminded, last_reminded_at,
       segment_started_at, elapsed_seconds, started_at, finished_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      data.customer_id,
      data.status_id,
      formatLocalDateTime(now),
      data.required_at,
      data.title,
      data.detail,
      data.reminded,
      lastRemindedAtForWrite(data.reminded),
      timing.segment_started_at,
      timing.elapsed_seconds,
      marked.started_at,
      marked.finished_at,
    ]
  );
  return Number(result.lastInsertId);
}

export async function updateItem(id: number, data: ItemWrite): Promise<void> {
  const db = await getDb();
  const current = await getItem(id);
  if (!current) {
    return;
  }
  const now = new Date();
  const nextName = await statusName(db, data.status_id);
  const timing = nextSegmentTiming(current, nextName, now);
  const marked = nextMarkedTimes(
    current.status_name,
    nextName,
    data.started_at,
    data.finished_at,
    now
  );
  if (data.reminded === 0) {
    await db.execute(
      `UPDATE items
       SET customer_id = $1, status_id = $2, required_at = $3, title = $4, detail = $5,
           reminded = 0, last_reminded_at = NULL,
           segment_started_at = $6, elapsed_seconds = $7,
           started_at = $8, finished_at = $9
       WHERE id = $10`,
      [
        data.customer_id,
        data.status_id,
        data.required_at,
        data.title,
        data.detail,
        timing.segment_started_at,
        timing.elapsed_seconds,
        marked.started_at,
        marked.finished_at,
        id,
      ]
    );
    return;
  }
  await db.execute(
    `UPDATE items
     SET customer_id = $1, status_id = $2, required_at = $3, title = $4, detail = $5,
         reminded = 1, last_reminded_at = COALESCE(last_reminded_at, $6),
         segment_started_at = $7, elapsed_seconds = $8,
         started_at = $9, finished_at = $10
     WHERE id = $11`,
    [
      data.customer_id,
      data.status_id,
      data.required_at,
      data.title,
      data.detail,
      formatLocalDateTime(now),
      timing.segment_started_at,
      timing.elapsed_seconds,
      marked.started_at,
      marked.finished_at,
      id,
    ]
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
    if (!("status_id" in patch)) {
      const setParts: string[] = [];
      const values: unknown[] = [];
      let idx = 1;
      for (const [key, value] of entries) {
        if (key === "reminded") {
          setParts.push(`reminded = $${idx}`);
          values.push(value);
          idx += 1;
          if (value === 0) {
            setParts.push("last_reminded_at = NULL");
          } else {
            setParts.push(`last_reminded_at = COALESCE(last_reminded_at, $${idx})`);
            values.push(formatLocalDateTime(new Date()));
            idx += 1;
          }
          continue;
        }
        setParts.push(`${key} = $${idx}`);
        values.push(value);
        idx += 1;
      }
      const idPlaceholders = ids.map((_, idIdx) => `$${idx + idIdx}`).join(", ");
      await db.execute(
        `UPDATE items SET ${setParts.join(", ")} WHERE id IN (${idPlaceholders})`,
        [...values, ...ids]
      );
      return;
    }

    const idPlaceholders = ids.map((_, idIdx) => `$${idIdx + 1}`).join(", ");
    const currents = await db.select<
      {
        id: number;
        segment_started_at: string | null;
        elapsed_seconds: number;
        started_at: string | null;
        finished_at: string | null;
        status_name: string | null;
      }[]
    >(
      `SELECT i.id, i.segment_started_at, i.elapsed_seconds, i.started_at, i.finished_at,
              s.name AS status_name
       FROM items i
       LEFT JOIN statuses s ON s.id = i.status_id
       WHERE i.id IN (${idPlaceholders})`,
      ids
    );
    const nextName = await statusName(db, patch.status_id ?? null);
    const now = new Date();
    for (const current of currents) {
      const timing = nextSegmentTiming(current, nextName, now);
      const marked = nextMarkedTimes(
        current.status_name,
        nextName,
        current.started_at,
        current.finished_at,
        now
      );
      const setParts: string[] = [];
      const values: unknown[] = [];
      let idx = 1;
      for (const [key, value] of entries) {
        if (key === "reminded") {
          setParts.push(`reminded = $${idx}`);
          values.push(value);
          idx += 1;
          if (value === 0) {
            setParts.push("last_reminded_at = NULL");
          } else {
            setParts.push(`last_reminded_at = COALESCE(last_reminded_at, $${idx})`);
            values.push(formatLocalDateTime(now));
            idx += 1;
          }
          continue;
        }
        setParts.push(`${key} = $${idx}`);
        values.push(value);
        idx += 1;
      }
      setParts.push(`segment_started_at = $${idx}`);
      values.push(timing.segment_started_at);
      idx += 1;
      setParts.push(`elapsed_seconds = $${idx}`);
      values.push(timing.elapsed_seconds);
      idx += 1;
      setParts.push(`started_at = $${idx}`);
      values.push(marked.started_at);
      idx += 1;
      setParts.push(`finished_at = $${idx}`);
      values.push(marked.finished_at);
      idx += 1;
      await db.execute(`UPDATE items SET ${setParts.join(", ")} WHERE id = $${idx}`, [
        ...values,
        current.id,
      ]);
    }
  });
}

export async function markReminded(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE items SET reminded = 1, last_reminded_at = $1 WHERE id = $2",
    [formatLocalDateTime(new Date()), id]
  );
}
