<script setup lang="ts">
import {Filter, RefreshCw, ScrollText} from "@lucide/vue";
import {computed, onMounted, reactive, ref} from "vue";

import EventLogList from "@/components/EventLogList.vue";
import {useDeviceStore} from "@/stores/deviceStore";
import {useEventStore} from "@/stores/eventStore";
import type {EventSource, RelayAction, RelayEventQuery,} from "@/types/api";

const deviceStore = useDeviceStore();
const eventStore = useEventStore();
const loading = ref(false);
const filters = reactive<{
  action: RelayAction | "";
  source: EventSource | "";
  from: string;
  to: string;
}>({
  action: "",
  source: "",
  from: "",
  to: "",
});

const selectedDeviceId = computed(() => deviceStore.selectedDeviceId);
const startItem = computed(() =>
  eventStore.total === 0
    ? 0
    : (eventStore.page - 1) * eventStore.pageSize + 1,
);
const endItem = computed(() =>
  Math.min(eventStore.page * eventStore.pageSize, eventStore.total),
);

async function load(page = eventStore.page): Promise<void> {
  const deviceId = selectedDeviceId.value;
  if (!deviceId) return;
  loading.value = true;
  const query: RelayEventQuery = {
    page,
    pageSize: eventStore.pageSize,
  };
  if (filters.action) query.action = filters.action;
  if (filters.source) query.source = filters.source;
  if (filters.from) query.from = new Date(filters.from).toISOString();
  if (filters.to) query.to = new Date(filters.to).toISOString();
  try {
    await eventStore.loadEvents(deviceId, query);
  } finally {
    loading.value = false;
  }
}

function resetFilters(): void {
  filters.action = "";
  filters.source = "";
  filters.from = "";
  filters.to = "";
  void load(1);
}

onMounted(() => {
  void deviceStore.loadDevices().then(() => load(1));
});
</script>

<template>
  <div class="logs-page">
    <section class="filter-bar">
      <div class="filter-title">
        <Filter :size="17" />
        <strong>筛选</strong>
      </div>
      <label>
        <span>设备</span>
        <select
          :value="selectedDeviceId ?? ''"
          @change="
            deviceStore.selectDevice(
              ($event.target as HTMLSelectElement).value,
            );
            load(1);
          "
        >
          <option
            v-for="device in deviceStore.devices"
            :key="device.deviceId"
            :value="device.deviceId"
          >
            {{ device.deviceName }}
          </option>
        </select>
      </label>
      <label>
        <span>动作</span>
        <select v-model="filters.action">
          <option value="">全部</option>
          <option value="ON">开启</option>
          <option value="OFF">关闭</option>
        </select>
      </label>
      <label>
        <span>来源</span>
        <select v-model="filters.source">
          <option value="">全部</option>
          <option value="ANDROID">Android</option>
          <option value="WEB">Web</option>
          <option value="ELECTRON">Electron</option>
          <option value="SYSTEM">系统</option>
        </select>
      </label>
      <label>
        <span>开始时间</span>
        <input v-model="filters.from" type="datetime-local" />
      </label>
      <label>
        <span>结束时间</span>
        <input v-model="filters.to" type="datetime-local" />
      </label>
      <div class="filter-actions">
        <button
          class="button button-primary"
          type="button"
          :disabled="loading || !selectedDeviceId"
          @click="load(1)"
        >
          <RefreshCw :size="15" :class="{ spin: loading }" />
          应用
        </button>
        <button
          class="button button-secondary"
          type="button"
          @click="resetFilters"
        >
          重置
        </button>
      </div>
    </section>

    <section class="data-panel">
      <div class="panel-heading">
        <div>
          <span class="section-kicker">只追加审计日志</span>
          <h2>继电器事件</h2>
        </div>
        <span class="record-count">共 {{ eventStore.total }} 条</span>
      </div>

      <EventLogList
        v-if="eventStore.events.length"
        :events="eventStore.events"
      />
      <div v-else class="empty-state compact">
        <ScrollText :size="24" />
        <strong>暂无继电器事件</strong>
        <span>上传第一条继电器操作后会显示在这里。</span>
      </div>

      <div v-if="eventStore.total > 0" class="pagination">
        <span>{{ startItem }}–{{ endItem }} / 共 {{ eventStore.total }} 条</span>
        <div>
          <button
            class="button button-secondary"
            type="button"
            :disabled="eventStore.page <= 1 || loading"
            @click="load(eventStore.page - 1)"
          >
            上一页
          </button>
          <button
            class="button button-secondary"
            type="button"
            :disabled="
              eventStore.page >= eventStore.totalPages || loading
            "
            @click="load(eventStore.page + 1)"
          >
            下一页
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
