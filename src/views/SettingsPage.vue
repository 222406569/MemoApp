<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  NButton,
  NCard,
  NDatePicker,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NSpace,
  NSwitch,
  useMessage,
} from "naive-ui";
import type { SelectOption } from "naive-ui";
import { listCustomers } from "../db/customers";
import { listStatuses } from "../db/statuses";
import { exporters } from "../db/export";
import { listItems } from "../db/items";
import { loadDefaultFilters } from "../db/presets";
import { listReminderRules, replaceReminderRules, scanAndNotify } from "../db/reminders";
import { listSortRules, replaceSortRules } from "../db/sort";
import {
  fromTimestamp,
  parseLocalDateTime,
  REMINDER_FIELD_LABELS,
  SORT_FIELD_LABELS,
  type Customer,
  type ReminderConfig,
  type ReminderField,
  type ReminderRule,
  type SortRule,
  type Status,
} from "../db/types";

const message = useMessage();
const customers = ref<Customer[]>([]);
const statuses = ref<Status[]>([]);
const sortDraft = ref<SortRule[]>([]);
const reminderDraft = ref<ReminderRule[]>([]);

const sortFieldOptions: SelectOption[] = Object.entries(SORT_FIELD_LABELS).map(
  ([value, label]) => ({ value, label })
);
const reminderFieldOptions: SelectOption[] = Object.entries(REMINDER_FIELD_LABELS).map(
  ([value, label]) => ({ value, label })
);
const opOptions: SelectOption[] = [
  { label: "=", value: "=" },
  { label: "like", value: "like" },
  { label: "not like", value: "not_like" },
  { label: "startswith", value: "startswith" },
  { label: "endswith", value: "endswith" },
];

function defaultConfig(field: ReminderField): ReminderConfig {
  if (field === "customer" || field === "status") {
    return { type: "in", ids: [] };
  }
  if (field === "created_at" || field === "required_at") {
    return { type: "relative", direction: "future", hours: 24 };
  }
  return { type: "op", op: "like", value: "" };
}

function customerOptions(): SelectOption[] {
  return customers.value.map((c) => ({ label: c.name, value: c.id }));
}
function statusOptions(): SelectOption[] {
  return statuses.value.map((s) => ({ label: s.name, value: s.id }));
}

function timeMode(rule: ReminderRule): "absolute" | "relative" {
  return rule.config.type === "absolute" ? "absolute" : "relative";
}

function setTimeMode(rule: ReminderRule, mode: "absolute" | "relative") {
  rule.config =
    mode === "absolute"
      ? { type: "absolute", from: null, to: null }
      : { type: "relative", direction: "future", hours: 24 };
}

function absoluteRange(rule: ReminderRule): [number, number] | null {
  if (rule.config.type !== "absolute" || !rule.config.from || !rule.config.to) {
    return null;
  }
  return [
    parseLocalDateTime(rule.config.from) ?? Date.now(),
    parseLocalDateTime(rule.config.to) ?? Date.now(),
  ];
}

function setAbsoluteRange(rule: ReminderRule, range: [number, number] | null) {
  if (rule.config.type !== "absolute") {
    return;
  }
  rule.config.from = range ? fromTimestamp(range[0]) : null;
  rule.config.to = range ? fromTimestamp(range[1]) : null;
}

async function reload() {
  customers.value = await listCustomers();
  statuses.value = await listStatuses();
  sortDraft.value = await listSortRules();
  reminderDraft.value = await listReminderRules();
}

function addSortRule() {
  sortDraft.value.push({
    id: Date.now(),
    field: "required_at",
    direction: "asc",
    nulls: "last",
    priority: sortDraft.value.length,
  });
}

function removeSortRule(index: number) {
  sortDraft.value.splice(index, 1);
}

function addReminderRule() {
  reminderDraft.value.push({
    id: Date.now(),
    field: "required_at",
    enabled: 1,
    config: defaultConfig("required_at"),
  });
}

function changeReminderField(rule: ReminderRule, field: ReminderField) {
  rule.field = field;
  rule.config = defaultConfig(field);
}

function removeReminderRule(index: number) {
  reminderDraft.value.splice(index, 1);
}

async function saveSort() {
  try {
    await replaceSortRules(
      sortDraft.value.map((rule) => ({
        field: rule.field,
        direction: rule.direction,
        nulls: rule.nulls,
      }))
    );
    message.success("排序已保存，事项列表下次查找时生效");
    await reload();
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e));
  }
}

async function saveReminders() {
  try {
    await replaceReminderRules(
      reminderDraft.value.map((rule) => ({
        field: rule.field,
        enabled: rule.enabled === 1,
        config: rule.config,
      }))
    );
    message.success("提醒规则已保存");
    await reload();
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e));
  }
}

async function exportWith(extension: string) {
  const exporter = exporters.find((item) => item.extension === extension);
  if (!exporter) {
    return;
  }
  try {
    const filters = await loadDefaultFilters();
    const sortRules = await listSortRules();
    const items = await listItems(filters, sortRules);
    await exporter.export(items);
    message.success(`已导出 ${exporter.label}`);
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e));
  }
}

async function testNotify() {
  const n = await scanAndNotify();
  message.info(n > 0 ? `已发送 ${n} 条通知` : "当前没有待提醒事项");
}

onMounted(() => {
  void reload();
});
</script>

<template>
  <n-space vertical size="large">
    <n-card title="事项排序">
      <p>按从上到下的优先级排序。客户和状态使用各自的排序优先级，其他字段按列值排序。</p>
      <n-space vertical>
        <n-space v-for="(rule, index) in sortDraft" :key="rule.id" align="center">
          <span>第 {{ index + 1 }} 级</span>
          <n-select v-model:value="rule.field" :options="sortFieldOptions" style="width: 140px" />
          <n-select
            v-model:value="rule.direction"
            :options="[
              { label: '升序', value: 'asc' },
              { label: '降序', value: 'desc' },
            ]"
            style="width: 110px"
          />
          <n-select
            v-model:value="rule.nulls"
            :options="[
              { label: '空值在前', value: 'first' },
              { label: '空值在后', value: 'last' },
            ]"
            style="width: 130px"
          />
          <n-button @click="removeSortRule(index)">移除</n-button>
        </n-space>
        <n-space>
          <n-button @click="addSortRule">添加字段</n-button>
          <n-button type="primary" @click="saveSort">保存排序</n-button>
        </n-space>
      </n-space>
    </n-card>

    <n-card title="提醒条件">
      <p>启用的规则全部满足时才会提醒。命中后弹出系统通知，并把事项的「是否提醒」标为是。</p>
      <n-space vertical>
        <n-card v-for="(rule, index) in reminderDraft" :key="rule.id" size="small">
          <n-form label-placement="left" label-width="90" :show-feedback="false">
            <n-space align="center" wrap>
              <n-form-item label="启用">
                <n-switch
                  :value="rule.enabled === 1"
                  @update:value="(v: boolean) => (rule.enabled = v ? 1 : 0)"
                />
              </n-form-item>
              <n-form-item label="字段">
                <n-select
                  :value="rule.field"
                  :options="reminderFieldOptions"
                  style="width: 140px"
                  @update:value="(v: ReminderField) => changeReminderField(rule, v)"
                />
              </n-form-item>
              <n-button @click="removeReminderRule(index)">删除规则</n-button>
            </n-space>

            <n-form-item v-if="rule.field === 'customer'" label="取值">
              <n-select
                v-if="rule.config.type === 'in'"
                v-model:value="rule.config.ids"
                multiple
                filterable
                :options="customerOptions()"
                style="min-width: 260px"
              />
            </n-form-item>
            <n-form-item v-else-if="rule.field === 'status'" label="取值">
              <n-select
                v-if="rule.config.type === 'in'"
                v-model:value="rule.config.ids"
                multiple
                filterable
                :options="statusOptions()"
                style="min-width: 260px"
              />
            </n-form-item>
            <template v-else-if="rule.field === 'created_at' || rule.field === 'required_at'">
              <n-form-item label="时间方式">
                <n-select
                  :value="timeMode(rule)"
                  :options="[
                    { label: '具体日期范围', value: 'absolute' },
                    { label: '相对当前时间', value: 'relative' },
                  ]"
                  style="width: 180px"
                  @update:value="(v: 'absolute' | 'relative') => setTimeMode(rule, v)"
                />
              </n-form-item>
              <n-form-item v-if="rule.config.type === 'absolute'" label="日期范围">
                <n-date-picker
                  :value="absoluteRange(rule)"
                  type="datetimerange"
                  clearable
                  @update:value="(v: [number, number] | null) => setAbsoluteRange(rule, v)"
                />
              </n-form-item>
              <n-space v-else-if="rule.config.type === 'relative'" align="center">
                <n-form-item label="方向">
                  <n-select
                    v-model:value="rule.config.direction"
                    :options="[
                      { label: '当前时间往前', value: 'past' },
                      { label: '当前时间往后', value: 'future' },
                    ]"
                    style="width: 160px"
                  />
                </n-form-item>
                <n-form-item label="小时">
                  <n-input-number v-model:value="rule.config.hours" :min="0" />
                </n-form-item>
              </n-space>
            </template>
            <n-space v-else-if="rule.config.type === 'op'" align="center">
              <n-form-item label="判断">
                <n-select v-model:value="rule.config.op" :options="opOptions" style="width: 140px" />
              </n-form-item>
              <n-form-item label="值">
                <n-input v-model:value="rule.config.value" style="width: 240px" />
              </n-form-item>
            </n-space>
          </n-form>
        </n-card>
        <n-space>
          <n-button @click="addReminderRule">添加规则</n-button>
          <n-button type="primary" @click="saveReminders">保存提醒规则</n-button>
          <n-button @click="testNotify">立即扫描提醒</n-button>
        </n-space>
      </n-space>
    </n-card>

    <n-card title="导出事项">
      <p>按当前默认查看条件和排序导出，便于迁移。后续可在同一接口上增加写入工单系统的实现。</p>
      <n-space>
        <n-button @click="exportWith('csv')">导出 CSV</n-button>
        <n-button type="primary" @click="exportWith('xlsx')">导出 XLSX</n-button>
      </n-space>
    </n-card>
  </n-space>
</template>
