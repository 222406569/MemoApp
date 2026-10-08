<script setup lang="ts">
import { h, onMounted, reactive, ref } from "vue";
import { open } from "@tauri-apps/plugin-dialog";
import {
  NButton,
  NCheckbox,
  NCheckboxGroup,
  NDataTable,
  NDatePicker,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSelect,
  NSpace,
  NSwitch,
  useDialog,
  useMessage,
} from "naive-ui";
import type { DataTableColumns, SelectOption } from "naive-ui";
import { listCustomers } from "../db/customers";
import { listStatuses } from "../db/statuses";
import {
  addAttachment,
  listAttachments,
  openAttachment,
  removeAttachment,
} from "../db/attachments";
import {
  batchUpdateItems,
  createItem,
  deleteItems,
  listItems,
  updateItem,
} from "../db/items";
import { loadDefaultFilters, saveDefaultFilters } from "../db/presets";
import { listSortRules } from "../db/sort";
import {
  emptyFilters,
  fromTimestamp,
  parseLocalDateTime,
  type Attachment,
  type Customer,
  type Item,
  type ItemBatchPatch,
  type ItemFilters,
  type ItemWrite,
  type SortRule,
  type Status,
} from "../db/types";

const message = useMessage();
const dialog = useDialog();

const customers = ref<Customer[]>([]);
const statuses = ref<Status[]>([]);
const sortRules = ref<SortRule[]>([]);
const filters = reactive<ItemFilters>(emptyFilters());
const rows = ref<Item[]>([]);
const checked = ref<number[]>([]);
const loading = ref(false);

const showForm = ref(false);
const editingId = ref<number | null>(null);
const form = reactive<ItemWrite>({
  customer_id: null,
  status_id: null,
  required_at: null,
  title: "",
  detail: "",
  reminded: 0,
});
const formRequiredAt = ref<number | null>(null);
const attachments = ref<Attachment[]>([]);

const showBatch = ref(false);
const batchFields = ref<string[]>([]);
const batchPatch = reactive<{
  customer_id: number | null;
  status_id: number | null;
  required_at: string | null;
  title: string;
  detail: string;
  reminded: number;
}>({
  customer_id: null,
  status_id: null,
  required_at: null,
  title: "",
  detail: "",
  reminded: 0,
});
const batchRequiredAt = ref<number | null>(null);

const createdRange = ref<[number, number] | null>(null);
const requiredRange = ref<[number, number] | null>(null);

const customerOptions = (): SelectOption[] =>
  customers.value.map((c) => ({ label: c.name, value: c.id }));
const statusOptions = (): SelectOption[] =>
  statuses.value.map((s) => ({ label: s.name, value: s.id }));

async function loadMasters() {
  customers.value = await listCustomers();
  statuses.value = await listStatuses();
  sortRules.value = await listSortRules();
}

async function search() {
  loading.value = true;
  try {
    if (createdRange.value) {
      filters.createdFrom = fromTimestamp(createdRange.value[0]);
      filters.createdTo = fromTimestamp(createdRange.value[1]);
    } else {
      filters.createdFrom = null;
      filters.createdTo = null;
    }
    if (requiredRange.value) {
      filters.requiredFrom = fromTimestamp(requiredRange.value[0]);
      filters.requiredTo = fromTimestamp(requiredRange.value[1]);
    } else {
      filters.requiredFrom = null;
      filters.requiredTo = null;
    }
    rows.value = await listItems(filters, sortRules.value);
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e));
  } finally {
    loading.value = false;
  }
}

async function saveAsDefault() {
  try {
    await saveDefaultFilters({ ...filters });
    message.success("已保存为默认查看条件");
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e));
  }
}

function applyRangesFromFilters() {
  if (filters.createdFrom && filters.createdTo) {
    createdRange.value = [
      parseLocalDateTime(filters.createdFrom) ?? Date.now(),
      parseLocalDateTime(filters.createdTo) ?? Date.now(),
    ];
  } else {
    createdRange.value = null;
  }
  if (filters.requiredFrom && filters.requiredTo) {
    requiredRange.value = [
      parseLocalDateTime(filters.requiredFrom) ?? Date.now(),
      parseLocalDateTime(filters.requiredTo) ?? Date.now(),
    ];
  } else {
    requiredRange.value = null;
  }
}

function resetForm() {
  form.customer_id = null;
  form.status_id = null;
  form.required_at = null;
  form.title = "";
  form.detail = "";
  form.reminded = 0;
  formRequiredAt.value = null;
  attachments.value = [];
}

function openCreate() {
  editingId.value = null;
  resetForm();
  showForm.value = true;
}

async function openEdit(row: Item) {
  editingId.value = row.id;
  form.customer_id = row.customer_id;
  form.status_id = row.status_id;
  form.required_at = row.required_at;
  form.title = row.title;
  form.detail = row.detail;
  form.reminded = row.reminded;
  formRequiredAt.value = parseLocalDateTime(row.required_at);
  attachments.value = await listAttachments(row.id);
  showForm.value = true;
}

async function saveItem() {
  if (form.customer_id != null && !customers.value.some((c) => c.id === form.customer_id)) {
    message.warning("客户必须选择已维护的名称");
    return;
  }
  if (form.status_id != null && !statuses.value.some((s) => s.id === form.status_id)) {
    message.warning("进度状态必须选择已维护的名称");
    return;
  }
  form.required_at = fromTimestamp(formRequiredAt.value);
  try {
    if (editingId.value == null) {
      await createItem({ ...form });
    } else {
      await updateItem(editingId.value, { ...form });
    }
    showForm.value = false;
    await search();
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e));
  }
}

function confirmDelete(ids: number[]) {
  dialog.warning({
    title: "删除事项",
    content: `确认删除 ${ids.length} 条事项？附件记录会一并删除。`,
    positiveText: "删除",
    negativeText: "取消",
    onPositiveClick: async () => {
      try {
        await deleteItems(ids);
        checked.value = [];
        await search();
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
      }
    },
  });
}

function openBatch() {
  batchFields.value = [];
  batchPatch.customer_id = null;
  batchPatch.status_id = null;
  batchPatch.required_at = null;
  batchPatch.title = "";
  batchPatch.detail = "";
  batchPatch.reminded = 0;
  batchRequiredAt.value = null;
  showBatch.value = true;
}

async function applyBatch() {
  const patch: ItemBatchPatch = {};
  if (batchFields.value.includes("customer_id")) {
    patch.customer_id = batchPatch.customer_id;
  }
  if (batchFields.value.includes("status_id")) {
    patch.status_id = batchPatch.status_id;
  }
  if (batchFields.value.includes("required_at")) {
    patch.required_at = fromTimestamp(batchRequiredAt.value);
  }
  if (batchFields.value.includes("title")) {
    patch.title = batchPatch.title;
  }
  if (batchFields.value.includes("detail")) {
    patch.detail = batchPatch.detail;
  }
  if (batchFields.value.includes("reminded")) {
    patch.reminded = batchPatch.reminded;
  }
  if (Object.keys(patch).length === 0) {
    message.warning("请勾选要修改的字段");
    return;
  }
  try {
    await batchUpdateItems(checked.value, patch);
    showBatch.value = false;
    await search();
    message.success("批量修改完成");
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e));
  }
}

async function pickAttachment() {
  if (editingId.value == null) {
    message.warning("请先保存事项后再添加附件");
    return;
  }
  const selected = await open({ multiple: false, directory: false });
  if (!selected || Array.isArray(selected)) {
    return;
  }
  try {
    await addAttachment(editingId.value, selected);
    attachments.value = await listAttachments(editingId.value);
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e));
  }
}

async function dropAttachment(attachment: Attachment) {
  await removeAttachment(attachment);
  if (editingId.value != null) {
    attachments.value = await listAttachments(editingId.value);
  }
}

const columns: DataTableColumns<Item> = [
  { type: "selection" },
  { title: "客户", key: "customer_name", width: 140 },
  { title: "创建时间", key: "created_at", width: 170 },
  { title: "要求时间", key: "required_at", width: 170 },
  { title: "进度状态", key: "status_name", width: 110 },
  { title: "需求", key: "title", ellipsis: { tooltip: true } },
  { title: "详细内容", key: "detail", ellipsis: { tooltip: true } },
  {
    title: "是否提醒",
    key: "reminded",
    width: 100,
    render: (row) => (row.reminded ? "是" : "否"),
  },
  {
    title: "操作",
    key: "actions",
    width: 150,
    render(row) {
      return h(NSpace, { size: 8 }, () => [
        h(NButton, { size: "small", onClick: () => void openEdit(row) }, () => "修改"),
        h(
          NButton,
          { size: "small", type: "error", ghost: true, onClick: () => confirmDelete([row.id]) },
          () => "删除"
        ),
      ]);
    },
  },
];

onMounted(async () => {
  try {
    await loadMasters();
    const saved = await loadDefaultFilters();
    Object.assign(filters, saved);
    applyRangesFromFilters();
    await search();
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e));
  }
});
</script>

<template>
  <n-space vertical size="large">
    <n-form label-placement="left" label-width="90" :show-feedback="false">
      <n-space align="center" wrap>
        <n-form-item label="客户名">
          <n-input v-model:value="filters.customerName" style="width: 160px" />
        </n-form-item>
        <n-form-item label="需求">
          <n-input v-model:value="filters.title" style="width: 160px" />
        </n-form-item>
        <n-form-item label="详细内容">
          <n-input v-model:value="filters.detail" style="width: 160px" />
        </n-form-item>
        <n-form-item label="创建时间">
          <n-date-picker v-model:value="createdRange" type="datetimerange" clearable />
        </n-form-item>
        <n-form-item label="要求时间">
          <n-date-picker v-model:value="requiredRange" type="datetimerange" clearable />
        </n-form-item>
        <n-form-item label="隐藏状态">
          <n-select
            v-model:value="filters.excludedStatusIds"
            multiple
            filterable
            :options="statusOptions()"
            style="min-width: 180px"
          />
        </n-form-item>
        <n-button type="primary" @click="search">查找</n-button>
        <n-button @click="saveAsDefault">保存为默认条件</n-button>
      </n-space>
    </n-form>

    <n-space>
      <n-button type="primary" @click="openCreate">新增事项</n-button>
      <n-button :disabled="checked.length === 0" @click="openBatch">批量修改</n-button>
      <n-button :disabled="checked.length === 0" @click="confirmDelete(checked)">批量删除</n-button>
    </n-space>

    <n-data-table
      :columns="columns"
      :data="rows"
      :loading="loading"
      :row-key="(row: Item) => row.id"
      v-model:checked-row-keys="checked"
      :scroll-x="1200"
    />

    <n-modal
      v-model:show="showForm"
      preset="card"
      :title="editingId == null ? '新增事项' : '修改事项'"
      style="width: 640px"
    >
      <n-form label-placement="left" label-width="90">
        <n-form-item label="客户">
          <n-select
            v-model:value="form.customer_id"
            filterable
            clearable
            :options="customerOptions()"
            placeholder="输入关键字联想"
          />
        </n-form-item>
        <n-form-item label="进度状态">
          <n-select
            v-model:value="form.status_id"
            filterable
            clearable
            :options="statusOptions()"
          />
        </n-form-item>
        <n-form-item label="要求时间">
          <n-date-picker v-model:value="formRequiredAt" type="datetime" clearable style="width: 100%" />
        </n-form-item>
        <n-form-item label="需求">
          <n-input v-model:value="form.title" />
        </n-form-item>
        <n-form-item label="详细内容">
          <n-input v-model:value="form.detail" type="textarea" :rows="4" />
        </n-form-item>
        <n-form-item label="是否提醒">
          <n-switch :value="form.reminded === 1" @update:value="(v: boolean) => (form.reminded = v ? 1 : 0)" />
        </n-form-item>
        <n-form-item v-if="editingId != null" label="附件">
          <n-space vertical>
            <n-button size="small" @click="pickAttachment">添加附件</n-button>
            <n-space v-for="file in attachments" :key="file.id">
              <n-button text type="primary" @click="openAttachment(file)">{{ file.original_name }}</n-button>
              <n-button size="tiny" type="error" ghost @click="dropAttachment(file)">移除</n-button>
            </n-space>
          </n-space>
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showForm = false">取消</n-button>
          <n-button type="primary" @click="saveItem">保存</n-button>
        </n-space>
      </template>
    </n-modal>

    <n-modal v-model:show="showBatch" preset="card" title="批量修改" style="width: 560px">
      <p>已选 {{ checked.length }} 条。勾选要改的字段后填写新值，未勾选的字段保持不变。</p>
      <n-checkbox-group v-model:value="batchFields">
        <n-space vertical>
          <n-space align="center">
            <n-checkbox value="customer_id" label="客户" />
            <n-select
              v-model:value="batchPatch.customer_id"
              filterable
              clearable
              :disabled="!batchFields.includes('customer_id')"
              :options="customerOptions()"
              style="width: 280px"
            />
          </n-space>
          <n-space align="center">
            <n-checkbox value="status_id" label="进度状态" />
            <n-select
              v-model:value="batchPatch.status_id"
              filterable
              clearable
              :disabled="!batchFields.includes('status_id')"
              :options="statusOptions()"
              style="width: 280px"
            />
          </n-space>
          <n-space align="center">
            <n-checkbox value="required_at" label="要求时间" />
            <n-date-picker
              v-model:value="batchRequiredAt"
              type="datetime"
              clearable
              :disabled="!batchFields.includes('required_at')"
            />
          </n-space>
          <n-space align="center">
            <n-checkbox value="title" label="需求" />
            <n-input v-model:value="batchPatch.title" :disabled="!batchFields.includes('title')" style="width: 280px" />
          </n-space>
          <n-space align="center">
            <n-checkbox value="detail" label="详细内容" />
            <n-input
              v-model:value="batchPatch.detail"
              :disabled="!batchFields.includes('detail')"
              style="width: 280px"
            />
          </n-space>
          <n-space align="center">
            <n-checkbox value="reminded" label="是否提醒" />
            <n-switch
              :disabled="!batchFields.includes('reminded')"
              :value="batchPatch.reminded === 1"
              @update:value="(v: boolean) => (batchPatch.reminded = v ? 1 : 0)"
            />
          </n-space>
        </n-space>
      </n-checkbox-group>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showBatch = false">取消</n-button>
          <n-button type="primary" @click="applyBatch">应用</n-button>
        </n-space>
      </template>
    </n-modal>
  </n-space>
</template>
