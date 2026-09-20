<script setup lang="ts">
import {Cpu, Usb} from "@lucide/vue";
import {computed} from "vue";

import {relayService} from "@/services/relay";
import type {HardwareStatus} from "@/services/relay/hardware";
import {hardwareStateLabel} from "@/services/relay/hardware";

const props = defineProps<{
  hardwareStatus: HardwareStatus;
}>();

const status = computed(() => props.hardwareStatus);
const localSupported = computed(() => relayService.isLocalControlSupported());
const hardwareConnected = computed(() => status.value.state === "CONNECTED");
const matchedProfile = computed(() => status.value.matchedProfile);
const currentPort = computed(
    () => status.value.lastPorts.find((p) => p.isCurrent) ?? null,
);

const hardwareStatusLabel = computed(() => {
  if (!localSupported.value) return "不可用";
  return hardwareStateLabel(status.value.state);
});

const serialParams = computed(() => {
  if (!matchedProfile.value) return "—";
  const p = matchedProfile.value;
  return `${p.baudRate} · ${p.dataBits}${
      p.parity === "none" ? "N" : p.parity.toUpperCase()[0]
  }${p.stopBits}`;
});
</script>

<template>
  <section class="panel-card hardware-info-card">
    <div class="panel-card-head">
      <div>
        <span class="section-kicker">硬件信息</span>
        <h2>硬件说明</h2>
      </div>
    </div>

    <dl class="info-grid">
      <div class="info-item">
        <dt>
          <Usb :size="14"/>
          硬件连接
        </dt>
        <dd
            class="info-value"
            :class="hardwareConnected ? 'success' : 'unknown'"
        >
          {{ hardwareStatusLabel }}
        </dd>
      </div>
      <div class="info-item">
        <dt>
          <Cpu :size="14"/>
          设备型号
        </dt>
        <dd class="info-value">
          {{ matchedProfile?.name ?? "—" }}
        </dd>
      </div>
      <div class="info-item">
        <dt>串口设备</dt>
        <dd class="info-value">{{ currentPort?.device ?? "—" }}</dd>
      </div>
      <div class="info-item">
        <dt>VID / PID</dt>
        <dd class="info-value">
          {{ currentPort?.vendorId ?? "—" }} /
          {{ currentPort?.productId ?? "—" }}
        </dd>
      </div>
      <div class="info-item">
        <dt>串口参数</dt>
        <dd class="info-value">{{ serialParams }}</dd>
      </div>
      <div class="info-item">
        <dt>通道</dt>
        <dd class="info-value">{{ matchedProfile?.channels ?? "—" }}</dd>
      </div>
    </dl>
  </section>
</template>
