<script setup lang="ts">
import {CircleHelp, Cpu, Usb} from "@lucide/vue";
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

const hardwareStatusLabel = computed(() => {
  if (!localSupported.value) return "不可用";
  return hardwareStateLabel(status.value.state);
});

const readbackLabel = computed(() => {
  if (!matchedProfile.value) return "—";
  return matchedProfile.value.supportsStateReadback ? "支持" : "不支持";
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
          HardwareProfile
        </dt>
        <dd class="info-value">
          {{ matchedProfile?.name ?? "未匹配" }}
        </dd>
      </div>
      <div class="info-item">
        <dt>
          <CircleHelp :size="14"/>
          状态回读
        </dt>
        <dd class="info-value" :class="matchedProfile?.supportsStateReadback ? 'success' : 'unknown'">
          {{ readbackLabel }}
        </dd>
      </div>
      <div class="info-item">
        <dt>
          <CircleHelp :size="14"/>
          实际硬件状态
        </dt>
        <dd class="info-value unknown">未知</dd>
      </div>
    </dl>

    <p class="inline-note hardware-explain">
      LCUS-1 当前没有已验证的状态回读协议，因此系统只能确认最后一次成功写入的指令，
      无法确认继电器触点当前物理状态。
    </p>
  </section>
</template>
