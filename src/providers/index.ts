import { ProviderRegistry } from '../core/providers/ProviderRegistry';
import { ProviderWorkspaceRegistry } from '../core/providers/ProviderWorkspaceRegistry';
import { antigravityWorkspaceRegistration } from './antigravity/app/AntigravityWorkspaceServices';
import { antigravityProviderRegistration } from './antigravity/registration';
import { claudeWorkspaceRegistration } from './claude/app/ClaudeWorkspaceServices';
import { claudeProviderRegistration } from './claude/registration';
import { codexWorkspaceRegistration } from './codex/app/CodexWorkspaceServices';
import { codexProviderRegistration } from './codex/registration';
import { copilotWorkspaceRegistration } from './copilot/app/CopilotWorkspaceServices';
import { copilotProviderRegistration } from './copilot/registration';
import { freebuffWorkspaceRegistration } from './freebuff/app/FreebuffWorkspaceServices';
import { freebuffProviderRegistration } from './freebuff/registration';
import { geminiWorkspaceRegistration } from './gemini/app/GeminiWorkspaceServices';
import { geminiProviderRegistration } from './gemini/registration';
import { opencodeWorkspaceRegistration } from './opencode/app/OpencodeWorkspaceServices';
import { opencodeProviderRegistration } from './opencode/registration';

let builtInProvidersRegistered = false;

export function registerBuiltInProviders(): void {
  if (builtInProvidersRegistered) {
    return;
  }

  ProviderRegistry.register('claude', claudeProviderRegistration);
  ProviderRegistry.register('codex', codexProviderRegistration);
  ProviderRegistry.register('copilot', copilotProviderRegistration);
  ProviderRegistry.register('gemini', geminiProviderRegistration);
  ProviderRegistry.register('antigravity', antigravityProviderRegistration);
  ProviderRegistry.register('opencode', opencodeProviderRegistration);
  ProviderRegistry.register('freebuff', freebuffProviderRegistration);
  ProviderWorkspaceRegistry.register('claude', claudeWorkspaceRegistration);
  ProviderWorkspaceRegistry.register('codex', codexWorkspaceRegistration);
  ProviderWorkspaceRegistry.register('copilot', copilotWorkspaceRegistration);
  ProviderWorkspaceRegistry.register('gemini', geminiWorkspaceRegistration);
  ProviderWorkspaceRegistry.register('antigravity', antigravityWorkspaceRegistration);
  ProviderWorkspaceRegistry.register('opencode', opencodeWorkspaceRegistration);
  ProviderWorkspaceRegistry.register('freebuff', freebuffWorkspaceRegistration);
  builtInProvidersRegistered = true;
}

registerBuiltInProviders();
