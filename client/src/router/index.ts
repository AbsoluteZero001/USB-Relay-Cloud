import {createRouter, createWebHistory} from "vue-router";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "dashboard",
      component: () => import("@/views/DashboardView.vue"),
        meta: {title: "首页"},
    },
    {
      path: "/devices",
      name: "devices",
      component: () => import("@/views/DevicesView.vue"),
        meta: {title: "设备"},
    },
    {
      path: "/logs",
      name: "logs",
      component: () => import("@/views/LogsView.vue"),
        meta: {title: "日志"},
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("@/views/SettingsView.vue"),
        meta: {title: "设置"},
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/",
    },
  ],
});

router.afterEach((route) => {
  const title = typeof route.meta.title === "string"
    ? route.meta.title
      : "首页";
  document.title = `${title} · USB Relay Cloud`;
});

export default router;
