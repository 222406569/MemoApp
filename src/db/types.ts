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
  last_reminded_at: string | null;
  segment_started_at: string | null;
  elapsed_seconds: number;
  started_at: string | null;
  finished_at: string | null;
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
  started_at: string | null;
  finished_at: string | null;
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

export function formatDisplayDateTime(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const ts = parseLocalDateTime(value);
  if (ts == null) {
    return value;
  }
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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

export function shiftMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) {
    return "不到1分钟";
  }
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  if (hours <= 0) {
    return `${remain}分钟`;
  }
  if (remain === 0) {
    return `${hours}小时`;
  }
  return `${hours}小时${remain}分钟`;
}

export function displayElapsed(
  item: Pick<Item, "status_name" | "segment_started_at" | "elapsed_seconds">,
  now: number
): string {
  let seconds = item.elapsed_seconds ?? 0;
  if (item.status_name === "进行中" && item.segment_started_at) {
    const start = parseLocalDateTime(item.segment_started_at);
    if (start != null) {
      seconds += Math.max(0, Math.floor((now - start) / 1000));
    }
  }
  return formatElapsed(seconds);
}
