import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "dashboard",
      component: () => import("@/views/DashboardView.vue"),
      meta: { title: "Dashboard" },
    },
    {
      path: "/devices",
      name: "devices",
      component: () => import("@/views/DevicesView.vue"),
      meta: { title: "Devices" },
    },
    {
      path: "/logs",
      name: "logs",
      component: () => import("@/views/LogsView.vue"),
      meta: { title: "Logs" },
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("@/views/SettingsView.vue"),
      meta: { title: "Settings" },
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
    : "Dashboard";
  document.title = `${title} · USB Relay Cloud`;
});

export default router;
