import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { getDb } from "./client";
import { markReminded } from "./items";
import {
  formatDisplayDateTime,
  formatLocalDateTime,
  shiftHours,
  shiftMinutes,
  type Item,
  type ReminderConfig,
  type ReminderField,
  type ReminderRule,
  type TextCompareOp,
} from "./types";

type StoredRule = {
  id: number;
  field: ReminderField;
  enabled: number;
  config_json: string;
};

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export async function listReminderRules(): Promise<ReminderRule[]> {
  const db = await getDb();
  const rows = await db.select<StoredRule[]>(
    "SELECT id, field, enabled, config_json FROM reminder_rules ORDER BY id"
  );
  return rows.map((row) => ({
    id: row.id,
    field: row.field,
    enabled: row.enabled,
    config: JSON.parse(row.config_json) as ReminderConfig,
  }));
}

export async function replaceReminderRules(
  rules: Array<{ field: ReminderField; enabled: boolean; config: ReminderConfig }>
): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM reminder_rules");
  for (const rule of rules) {
    await db.execute(
      "INSERT INTO reminder_rules (field, enabled, config_json) VALUES ($1, $2, $3)",
      [rule.field, rule.enabled ? 1 : 0, JSON.stringify(rule.config)]
    );
  }
}

export async function getReminderIntervalMinutes(): Promise<number | null> {
  const db = await getDb();
  const rows = await db.select<{ interval_minutes: number | null }[]>(
    "SELECT interval_minutes FROM reminder_settings WHERE id = 1"
  );
  const value = rows[0]?.interval_minutes;
  if (value == null) {
    return null;
  }
  return Number(value);
}

export async function setReminderIntervalMinutes(minutes: number | null): Promise<void> {
  if (minutes != null) {
    if (!Number.isInteger(minutes) || minutes < 1) {
      throw new Error("提醒间隔最短为 1 分钟");
    }
  }
  const db = await getDb();
  await db.execute(
    `INSERT INTO reminder_settings (id, interval_minutes) VALUES (1, $1)
     ON CONFLICT(id) DO UPDATE SET interval_minutes = excluded.interval_minutes`,
    [minutes]
  );
}

function textClause(
  column: string,
  op: TextCompareOp,
  value: string,
  index: number
): { sql: string; params: unknown[]; next: number } {
  if (op === "=") {
    return { sql: `${column} = $${index}`, params: [value], next: index + 1 };
  }
  const escaped = escapeLike(value);
  if (op === "like") {
    return {
      sql: `${column} LIKE $${index} ESCAPE '\\'`,
      params: [`%${escaped}%`],
      next: index + 1,
    };
  }
  if (op === "not_like") {
    return {
      sql: `${column} NOT LIKE $${index} ESCAPE '\\'`,
      params: [`%${escaped}%`],
      next: index + 1,
    };
  }
  if (op === "startswith") {
    return {
      sql: `${column} LIKE $${index} ESCAPE '\\'`,
      params: [`${escaped}%`],
      next: index + 1,
    };
  }
  return {
    sql: `${column} LIKE $${index} ESCAPE '\\'`,
    params: [`%${escaped}`],
    next: index + 1,
  };
}

function ruleToSql(
  rule: ReminderRule,
  now: Date,
  index: number
): { sql: string; params: unknown[]; next: number } {
  const config = rule.config;
  if (rule.field === "customer" || rule.field === "status") {
    const column = rule.field === "customer" ? "i.customer_id" : "i.status_id";
    const ids = config.type === "in" ? config.ids : [];
    if (ids.length === 0) {
      return { sql: "1 = 0", params: [], next: index };
    }
    const placeholders = ids.map((_, idx) => `$${index + idx}`).join(", ");
    return {
      sql: `${column} IN (${placeholders})`,
      params: ids,
      next: index + ids.length,
    };
  }

  if (rule.field === "created_at" || rule.field === "required_at") {
    const column = `i.${rule.field}`;
    if (config.type === "absolute") {
      const parts: string[] = [`${column} IS NOT NULL`];
      const params: unknown[] = [];
      let next = index;
      if (config.from) {
        parts.push(`${column} >= $${next}`);
        params.push(config.from);
        next += 1;
      }
      if (config.to) {
        parts.push(`${column} <= $${next}`);
        params.push(config.to);
        next += 1;
      }
      return { sql: parts.join(" AND "), params, next };
    }
    if (config.type === "relative") {
      const hours = Number.isFinite(config.hours) ? config.hours : 0;
      const from =
        config.direction === "past" ? shiftHours(now, -hours) : now;
      const to =
        config.direction === "past" ? now : shiftHours(now, hours);
      return {
        sql: `${column} IS NOT NULL AND ${column} >= $${index} AND ${column} <= $${index + 1}`,
        params: [formatLocalDateTime(from), formatLocalDateTime(to)],
        next: index + 2,
      };
    }
  }

  if ((rule.field === "title" || rule.field === "detail") && config.type === "op") {
    return textClause(`i.${rule.field}`, config.op, config.value, index);
  }

  return { sql: "1 = 1", params: [], next: index };
}

export async function findItemsToRemind(): Promise<Item[]> {
  const rules = (await listReminderRules()).filter((rule) => rule.enabled === 1);
  if (rules.length === 0) {
    return [];
  }
  const db = await getDb();
  const now = new Date();
  const intervalMinutes = await getReminderIntervalMinutes();
  const clauses: string[] = [];
  const params: unknown[] = [];
  let index = 1;

  if (intervalMinutes == null) {
    clauses.push("i.reminded = 0");
  } else {
    await db.execute(
      "UPDATE items SET last_reminded_at = $1 WHERE reminded = 1 AND last_reminded_at IS NULL",
      [formatLocalDateTime(now)]
    );
    const threshold = formatLocalDateTime(shiftMinutes(now, -intervalMinutes));
    clauses.push(`(i.last_reminded_at IS NULL OR i.last_reminded_at <= $${index})`);
    params.push(threshold);
    index += 1;
  }

  for (const rule of rules) {
    const piece = ruleToSql(rule, now, index);
    clauses.push(`(${piece.sql})`);
    params.push(...piece.params);
    index = piece.next;
  }
  return db.select<Item[]>(
    `SELECT i.id, i.customer_id, i.status_id, i.created_at, i.required_at, i.title, i.detail, i.reminded,
            i.last_reminded_at, i.segment_started_at, i.elapsed_seconds, i.started_at, i.finished_at,
            c.name AS customer_name, s.name AS status_name
     FROM items i
     LEFT JOIN customers c ON c.id = i.customer_id
     LEFT JOIN statuses s ON s.id = i.status_id
     WHERE ${clauses.join(" AND ")}`,
    params
  );
}

export async function ensureNotifyPermission(): Promise<boolean> {
  let granted = await isPermissionGranted();
  if (!granted) {
    const permission = await requestPermission();
    granted = permission === "granted";
  }
  return granted;
}

export async function scanAndNotify(): Promise<number> {
  const granted = await ensureNotifyPermission();
  if (!granted) {
    return 0;
  }
  const items = await findItemsToRemind();
  let count = 0;
  for (const item of items) {
    try {
      sendNotification({
        title: item.title || "工作备忘录",
        body: [item.customer_name, item.status_name, formatDisplayDateTime(item.required_at)]
          .filter(Boolean)
          .join(" · "),
      });
      await markReminded(item.id);
      count += 1;
    } catch {
      // 单条失败不影响后续
    }
  }
  return count;
}
