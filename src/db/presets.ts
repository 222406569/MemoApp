import { getDb } from "./client";
import { emptyFilters, type ItemFilters } from "./types";

export async function loadDefaultFilters(): Promise<ItemFilters> {
  const db = await getDb();
  const rows = await db.select<{ filters_json: string }[]>(
    "SELECT filters_json FROM view_presets WHERE is_default = 1 LIMIT 1"
  );
  if (!rows[0]) {
    return emptyFilters();
  }
  return { ...emptyFilters(), ...(JSON.parse(rows[0].filters_json) as ItemFilters) };
}

export async function saveDefaultFilters(filters: ItemFilters): Promise<void> {
  const db = await getDb();
  const json = JSON.stringify(filters);
  const existing = await db.select<{ id: number }[]>(
    "SELECT id FROM view_presets WHERE is_default = 1 LIMIT 1"
  );
  if (existing[0]) {
    await db.execute("UPDATE view_presets SET filters_json = $1 WHERE id = $2", [
      json,
      existing[0].id,
    ]);
    return;
  }
  await db.execute(
    "INSERT INTO view_presets (name, is_default, filters_json) VALUES ($1, 1, $2)",
    ["默认", json]
  );
}
