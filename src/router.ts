import { createRouter, createWebHashHistory } from "vue-router";
import ItemsPage from "./views/ItemsPage.vue";
import CustomersPage from "./views/CustomersPage.vue";
import StatusesPage from "./views/StatusesPage.vue";
import SettingsPage from "./views/SettingsPage.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/items" },
    { path: "/items", component: ItemsPage, meta: { title: "事项" } },
    { path: "/customers", component: CustomersPage, meta: { title: "客户" } },
    { path: "/statuses", component: StatusesPage, meta: { title: "进度状态" } },
    { path: "/settings", component: SettingsPage, meta: { title: "设置" } },
  ],
});
