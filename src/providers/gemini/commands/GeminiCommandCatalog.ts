import type { ProviderCommandCatalog, ProviderCommandDropdownConfig } from '../../../core/providers/commands/ProviderCommandCatalog';
import type { ProviderCommandEntry } from '../../../core/providers/commands/ProviderCommandEntry';
import type { SlashCommand } from '../../../core/types';

function slashCommandToEntry(command: SlashCommand): ProviderCommandEntry {
  const normalizedName = command.name.trim().replace(/^\/+/, '');
  return {
    id: command.id,
    providerId: 'gemini',
    kind: 'command',
    name: normalizedName,
    description: command.description,
    content: command.content,
    argumentHint: command.argumentHint,
    allowedTools: command.allowedTools,
    model: command.model,
    disableModelInvocation: command.disableModelInvocation,
    userInvocable: command.userInvocable,
    context: command.context,
    agent: command.agent,
    hooks: command.hooks,
    scope: 'runtime',
    source: command.source ?? 'sdk',
    isEditable: false,
    isDeletable: false,
    displayPrefix: '/',
    insertPrefix: '/',
  };
}

function dedupe(commands: SlashCommand[]): SlashCommand[] {
  const result: SlashCommand[] = [];
  const seen = new Set<string>();
  for (const command of commands) {
    const name = command.name.trim().replace(/^\/+/, '');
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...command, name });
  }
  return result;
}

export class GeminiCommandCatalog implements ProviderCommandCatalog {
  private runtimeCommands: SlashCommand[] = [];

  setRuntimeCommands(commands: SlashCommand[]): void {
    this.runtimeCommands = dedupe(commands);
  }

  async listDropdownEntries(): Promise<ProviderCommandEntry[]> {
    return this.runtimeCommands.map(slashCommandToEntry);
  }

  async listVaultEntries(): Promise<ProviderCommandEntry[]> { return []; }
  async saveVaultEntry(): Promise<void> { throw new Error('Gemini runtime commands are not editable from iClaudian.'); }
  async deleteVaultEntry(): Promise<void> { throw new Error('Gemini runtime commands are not deletable from iClaudian.'); }

  getDropdownConfig(): ProviderCommandDropdownConfig {
    return {
      providerId: 'gemini',
      triggerChars: ['/'],
      builtInPrefix: '/',
      skillPrefix: '/',
      commandPrefix: '/',
    };
  }

  async refresh(): Promise<void> {}
}
