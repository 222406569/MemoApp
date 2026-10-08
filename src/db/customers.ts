import { getDb } from "./client";
import type { Customer } from "./types";

export async function listCustomers(): Promise<Customer[]> {
  const db = await getDb();
  return db.select<Customer[]>(
    "SELECT id, name, sort_priority FROM customers ORDER BY sort_priority ASC, name ASC"
  );
}

export async function createCustomer(name: string, sortPriority: number): Promise<void> {
  const db = await getDb();
  await db.execute("INSERT INTO customers (name, sort_priority) VALUES ($1, $2)", [
    name.trim(),
    sortPriority,
  ]);
}

export async function updateCustomer(
  id: number,
  name: string,
  sortPriority: number
): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE customers SET name = $1, sort_priority = $2 WHERE id = $3", [
    name.trim(),
    sortPriority,
    id,
  ]);
}

export async function countItemsForCustomer(id: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ c: number }[]>(
    "SELECT COUNT(*) as c FROM items WHERE customer_id = $1",
    [id]
  );
  return rows[0]?.c ?? 0;
}

export async function deleteCustomers(ids: number[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const db = await getDb();
  for (const id of ids) {
    const used = await countItemsForCustomer(id);
    if (used > 0) {
      const rows = await db.select<{ name: string }[]>(
        "SELECT name FROM customers WHERE id = $1",
        [id]
      );
      throw new Error(`客户「${rows[0]?.name ?? id}」仍有事项引用，无法删除`);
    }
  }
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  await db.execute(`DELETE FROM customers WHERE id IN (${placeholders})`, ids);
}
