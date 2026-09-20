import {createRouter, createWebHistory} from "vue-router";

import {useAuthStore} from "@/stores/authStore";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
        path: "/login",
        name: "login",
        component: () => import("@/views/LoginView.vue"),
        meta: {title: "登录", public: true},
    },
      {
          path: "/server-settings",
          name: "server-settings",
          component: () => import("@/views/ServerSettingsView.vue"),
          meta: {title: "服务器设置", public: true},
      },
      {
      path: "/",
      name: "dashboard",
      component: () => import("@/views/DashboardView.vue"),
          meta: {title: "控制台"},
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
        meta: {title: "操作日志"},
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

// 全局前置守卫：未登录访问受保护路由 → 跳转 /login?redirect=<原路径>
router.beforeEach((to) => {
    const auth = useAuthStore();
    if (to.meta.public) {
        if (to.name === "login" && auth.isAuthenticated) {
            return {name: "dashboard"};
        }
        return true;
    }
    if (!auth.isAuthenticated) {
        return {
            name: "login",
            query: to.fullPath && to.fullPath !== "/"
                ? {redirect: to.fullPath}
                : undefined,
        };
    }
    return true;
});

router.afterEach((route) => {
  const title = typeof route.meta.title === "string"
    ? route.meta.title
      : "控制台";
  document.title = `${title} · USB Relay Cloud`;
});

export default router;
