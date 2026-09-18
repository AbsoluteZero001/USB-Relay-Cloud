import type {
  RelayProvider,
  RelayProviderCommand,
  RelayProviderExecution,
} from "./RelayProvider";

export class CloudRelayProvider implements RelayProvider {
  readonly id = "CLOUD" as const;

  isAvailable(): boolean {
    return false;
  }

  async execute(
    _command: RelayProviderCommand,
  ): Promise<RelayProviderExecution> {
      throw new Error("远程控制将在后续版本提供");
  }
}
