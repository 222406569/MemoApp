<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import {
  NLayout,
  NLayoutSider,
  NLayoutContent,
  NMenu,
  NMessageProvider,
  NDialogProvider,
  NConfigProvider,
  zhCN,
  dateZhCN,
} from "naive-ui";
import type { MenuOption } from "naive-ui";
import { migrate } from "./db/migrate";
import { scanAndNotify } from "./db/reminders";

const route = useRoute();
const router = useRouter();
const ready = ref(false);
const error = ref("");
let timer: number | null = null;

const menuOptions: MenuOption[] = [
  { label: "事项", key: "/items" },
  { label: "客户", key: "/customers" },
  { label: "进度状态", key: "/statuses" },
  { label: "设置", key: "/settings" },
];

const activeKey = computed(() => route.path);

onMounted(async () => {
  try {
    await migrate();
    ready.value = true;
    await scanAndNotify();
    timer = window.setInterval(() => {
      void scanAndNotify();
    }, 60_000);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
});

onUnmounted(() => {
  if (timer != null) {
    window.clearInterval(timer);
  }
});
</script>

<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
      <n-dialog-provider>
        <n-layout has-sider style="height: 100%">
          <n-layout-sider bordered :width="180">
            <div class="brand">工作备忘录</div>
            <n-menu
              :value="activeKey"
              :options="menuOptions"
              @update:value="(key: string) => router.push(key)"
            />
          </n-layout-sider>
          <n-layout-content content-style="padding: 16px; height: 100%; overflow: auto;">
            <div v-if="error" class="boot-error">启动失败：{{ error }}</div>
            <RouterView v-else-if="ready" />
            <div v-else>正在初始化本地数据库…</div>
          </n-layout-content>
        </n-layout>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style scoped>
.brand {
  padding: 16px 20px 8px;
  font-weight: 600;
}
.boot-error {
  color: #d03050;
}
</style>
