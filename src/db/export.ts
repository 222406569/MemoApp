import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import * as XLSX from "xlsx";
import { listAttachmentsForItems } from "./attachments";
import type { Item } from "./types";

export type ItemExporter = {
  label: string;
  extension: string;
  export: (items: Item[]) => Promise<void>;
};

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

async function attachmentNames(items: Item[]): Promise<Map<number, string>> {
  const attachments = await listAttachmentsForItems(items.map((item) => item.id));
  const map = new Map<number, string[]>();
  for (const attachment of attachments) {
    const list = map.get(attachment.item_id) ?? [];
    list.push(attachment.original_name);
    map.set(attachment.item_id, list);
  }
  return new Map(
    [...map.entries()].map(([id, names]) => [id, names.join("; ")])
  );
}

function rowsOf(items: Item[], names: Map<number, string>): Record<string, string>[] {
  return items.map((item) => ({
    客户: item.customer_name ?? "",
    进度状态: item.status_name ?? "",
    创建时间: item.created_at,
    要求时间: item.required_at ?? "",
    需求: item.title,
    详细内容: item.detail,
    是否提醒: item.reminded ? "是" : "否",
    附件: names.get(item.id) ?? "",
  }));
}

async function pickPath(extension: string, defaultName: string): Promise<string | null> {
  return save({
    defaultPath: defaultName,
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
  });
}

export const CsvExporter: ItemExporter = {
  label: "CSV",
  extension: "csv",
  export: async (items) => {
    const path = await pickPath("csv", "事项.csv");
    if (!path) {
      return;
    }
    const names = await attachmentNames(items);
    const rows = rowsOf(items, names);
    const headers = Object.keys(rows[0] ?? {
      客户: "",
      进度状态: "",
      创建时间: "",
      要求时间: "",
      需求: "",
      详细内容: "",
      是否提醒: "",
      附件: "",
    });
    const lines = [
      headers.join(","),
      ...rows.map((row) => headers.map((key) => csvCell(row[key] ?? "")).join(",")),
    ];
    const content = `\uFEFF${lines.join("\r\n")}`;
    await writeFile(path, new TextEncoder().encode(content));
  },
};

export const XlsxExporter: ItemExporter = {
  label: "XLSX",
  extension: "xlsx",
  export: async (items) => {
    const path = await pickPath("xlsx", "事项.xlsx");
    if (!path) {
      return;
    }
    const names = await attachmentNames(items);
    const rows = rowsOf(items, names);
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "事项");
    const buffer = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    await writeFile(path, new Uint8Array(buffer));
  },
};

export const exporters: ItemExporter[] = [CsvExporter, XlsxExporter];
