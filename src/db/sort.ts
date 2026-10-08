import { getDb } from "./client";
import type { SortField, SortRule } from "./types";

export async function listSortRules(): Promise<SortRule[]> {
  const db = await getDb();
  const rows = await db.select<SortRule[]>(
    "SELECT id, field, direction, nulls, priority FROM sort_rules ORDER BY priority ASC, id ASC"
  );
  return rows;
}

export async function replaceSortRules(
  rules: Array<{ field: SortField; direction: "asc" | "desc"; nulls: "first" | "last" }>
): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM sort_rules");
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i];
    await db.execute(
      "INSERT INTO sort_rules (field, direction, nulls, priority) VALUES ($1, $2, $3, $4)",
      [rule.field, rule.direction, rule.nulls, i]
    );
  }
}
