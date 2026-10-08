export type ItemFilters = {
  customerName: string;
  title: string;
  detail: string;
  createdFrom: string | null;
  createdTo: string | null;
  requiredFrom: string | null;
  requiredTo: string | null;
  excludedStatusIds: number[];
};

export const emptyFilters = (): ItemFilters => ({
  customerName: "",
  title: "",
  detail: "",
  createdFrom: null,
  createdTo: null,
  requiredFrom: null,
  requiredTo: null,
  excludedStatusIds: [],
});

export type Customer = {
  id: number;
  name: string;
  sort_priority: number;
};

export type Status = {
  id: number;
  name: string;
  sort_priority: number;
};

export type Attachment = {
  id: number;
  item_id: number;
  original_name: string;
  stored_path: string;
};

export type Item = {
  id: number;
  customer_id: number | null;
  status_id: number | null;
  created_at: string;
  required_at: string | null;
  title: string;
  detail: string;
  reminded: number;
  customer_name: string | null;
  status_name: string | null;
};

export type ItemWrite = {
  customer_id: number | null;
  status_id: number | null;
  required_at: string | null;
  title: string;
  detail: string;
  reminded: number;
};

export type ItemBatchPatch = Partial<
  Pick<
    ItemWrite,
    "customer_id" | "status_id" | "required_at" | "title" | "detail" | "reminded"
  >
>;

export type SortField =
  | "customer"
  | "status"
  | "created_at"
  | "required_at"
  | "title"
  | "detail"
  | "reminded";

export type SortRule = {
  id: number;
  field: SortField;
  direction: "asc" | "desc";
  nulls: "first" | "last";
  priority: number;
};

export type TextCompareOp = "=" | "like" | "not_like" | "startswith" | "endswith";

export type ReminderConfig =
  | { type: "in"; ids: number[] }
  | { type: "absolute"; from: string | null; to: string | null }
  | { type: "relative"; direction: "past" | "future"; hours: number }
  | { type: "op"; op: TextCompareOp; value: string };

export type ReminderField =
  | "customer"
  | "status"
  | "created_at"
  | "required_at"
  | "title"
  | "detail";

export type ReminderRule = {
  id: number;
  field: ReminderField;
  enabled: number;
  config: ReminderConfig;
};

export const SORT_FIELD_LABELS: Record<SortField, string> = {
  customer: "客户",
  status: "进度状态",
  created_at: "创建时间",
  required_at: "要求时间",
  title: "需求",
  detail: "详细内容",
  reminded: "是否提醒",
};

export const REMINDER_FIELD_LABELS: Record<ReminderField, string> = {
  customer: "客户",
  status: "进度状态",
  created_at: "创建时间",
  required_at: "要求时间",
  title: "需求",
  detail: "详细内容",
};

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatLocalDateTime(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function parseLocalDateTime(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d.getTime();
}

export function fromTimestamp(ts: number | null | undefined): string | null {
  if (ts == null) {
    return null;
  }
  return formatLocalDateTime(new Date(ts));
}

export function shiftHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}
