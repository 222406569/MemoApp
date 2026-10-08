<script setup lang="ts">
import { h, onMounted, ref } from "vue";
import {
  NButton,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NSpace,
  useDialog,
  useMessage,
} from "naive-ui";
import type { DataTableColumns } from "naive-ui";
import {
  createCustomer,
  deleteCustomers,
  listCustomers,
  updateCustomer,
} from "../db/customers";
import type { Customer } from "../db/types";

const message = useMessage();
const dialog = useDialog();
const rows = ref<Customer[]>([]);
const checked = ref<number[]>([]);
const showModal = ref(false);
const editing = ref<Customer | null>(null);
const form = ref({ name: "", sort_priority: 0 });
const loading = ref(false);

async function refresh() {
  loading.value = true;
  try {
    rows.value = await listCustomers();
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e));
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  form.value = { name: "", sort_priority: rows.value.length * 10 };
  showModal.value = true;
}

function openEdit(row: Customer) {
  editing.value = row;
  form.value = { name: row.name, sort_priority: row.sort_priority };
  showModal.value = true;
}

async function save() {
  if (!form.value.name.trim()) {
    message.warning("请填写客户名称");
    return;
  }
  try {
    if (editing.value) {
      await updateCustomer(editing.value.id, form.value.name, form.value.sort_priority);
    } else {
      await createCustomer(form.value.name, form.value.sort_priority);
    }
    showModal.value = false;
    await refresh();
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e));
  }
}

function confirmDelete(ids: number[]) {
  dialog.warning({
    title: "删除客户",
    content: "仍有事项引用的客户无法删除。确认删除所选客户？",
    positiveText: "删除",
    negativeText: "取消",
    onPositiveClick: async () => {
      try {
        await deleteCustomers(ids);
        checked.value = [];
        await refresh();
      } catch (e) {
        message.error(e instanceof Error ? e.message : String(e));
      }
    },
  });
}

const columns: DataTableColumns<Customer> = [
  { type: "selection" },
  { title: "名称", key: "name" },
  { title: "排序优先级", key: "sort_priority", width: 140 },
  {
    title: "操作",
    key: "actions",
    width: 160,
    render(row) {
      return h(NSpace, { size: 8 }, () => [
        h(NButton, { size: "small", onClick: () => openEdit(row) }, () => "修改"),
        h(
          NButton,
          { size: "small", type: "error", ghost: true, onClick: () => confirmDelete([row.id]) },
          () => "删除"
        ),
      ]);
    },
  },
];

onMounted(() => {
  void refresh();
});
</script>

<template>
  <n-space vertical size="large">
    <n-space>
      <n-button type="primary" @click="openCreate">新增客户</n-button>
      <n-button :disabled="checked.length === 0" @click="confirmDelete(checked)">批量删除</n-button>
    </n-space>
    <n-data-table
      :columns="columns"
      :data="rows"
      :loading="loading"
      :row-key="(row: Customer) => row.id"
      v-model:checked-row-keys="checked"
    />
    <n-modal v-model:show="showModal" preset="card" :title="editing ? '修改客户' : '新增客户'" style="width: 420px">
      <n-form label-placement="left" label-width="100">
        <n-form-item label="客户名称">
          <n-input v-model:value="form.name" />
        </n-form-item>
        <n-form-item label="排序优先级">
          <n-input-number v-model:value="form.sort_priority" :show-button="false" style="width: 100%" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" @click="save">保存</n-button>
        </n-space>
      </template>
    </n-modal>
  </n-space>
</template>
