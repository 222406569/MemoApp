import { appDataDir, basename, join } from "@tauri-apps/api/path";
import { copyFile, mkdir, remove } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { getDb } from "./client";
import type { Attachment } from "./types";

export async function listAttachments(itemId: number): Promise<Attachment[]> {
  const db = await getDb();
  return db.select<Attachment[]>(
    "SELECT id, item_id, original_name, stored_path FROM attachments WHERE item_id = $1 ORDER BY id",
    [itemId]
  );
}

export async function listAttachmentsForItems(itemIds: number[]): Promise<Attachment[]> {
  if (itemIds.length === 0) {
    return [];
  }
  const db = await getDb();
  const placeholders = itemIds.map((_, i) => `$${i + 1}`).join(", ");
  return db.select<Attachment[]>(
    `SELECT id, item_id, original_name, stored_path FROM attachments WHERE item_id IN (${placeholders}) ORDER BY item_id, id`,
    itemIds
  );
}

export async function addAttachment(itemId: number, sourcePath: string): Promise<void> {
  const originalName = await basename(sourcePath);
  const root = await appDataDir();
  const dir = await join(root, "attachments", String(itemId));
  await mkdir(dir, { recursive: true });
  const storedPath = await join(dir, `${Date.now()}_${originalName}`);
  await copyFile(sourcePath, storedPath);
  const db = await getDb();
  await db.execute(
    "INSERT INTO attachments (item_id, original_name, stored_path) VALUES ($1, $2, $3)",
    [itemId, originalName, storedPath]
  );
}

export async function removeAttachment(attachment: Attachment): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM attachments WHERE id = $1", [attachment.id]);
  try {
    await remove(attachment.stored_path);
  } catch {
    // 磁盘文件缺失时仍删除记录
  }
}

export async function openAttachment(attachment: Attachment): Promise<void> {
  await openPath(attachment.stored_path);
}
