import type { ProviderTaskResultInterpreter, ProviderTaskTerminalStatus } from '../../../core/providers/types';

export class CopilotTaskResultInterpreter implements ProviderTaskResultInterpreter {
  hasAsyncLaunchMarker(): boolean { return false; }
  extractAgentId(): string | null { return null; }
  extractStructuredResult(): string | null { return null; }
  resolveTerminalStatus(_toolUseResult: unknown, fallbackStatus: ProviderTaskTerminalStatus): ProviderTaskTerminalStatus { return fallbackStatus; }
  extractTagValue(): string | null { return null; }
}
