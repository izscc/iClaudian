import * as fs from 'fs';
import { Setting } from 'obsidian';

import type { ProviderSettingsTabRenderer } from '../../../core/providers/types';
import { renderEnvironmentSettingsSection } from '../../../features/settings/ui/EnvironmentSettingsSection';
import { t } from '../../../i18n/i18n';
import { getHostnameKey } from '../../../utils/env';
import { expandHomePath } from '../../../utils/path';
import { maybeGetCopilotWorkspaceServices } from '../app/CopilotWorkspaceServices';
import { COPILOT_FALLBACK_MODELS, encodeCopilotModelId } from '../models';
import type { CopilotApprovalMode } from '../settings';
import { getCopilotProviderSettings, updateCopilotProviderSettings } from '../settings';

type I18nKey = Parameters<typeof t>[0];
const tt = (key: string, fallback: string): string => {
  const value = t(key as I18nKey);
  return value === key ? fallback : value;
};

function parseLines(value: string): string[] {
  return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

export const copilotSettingsTabRenderer: ProviderSettingsTabRenderer = {
  render(container, context) {
    const copilotWorkspace = maybeGetCopilotWorkspaceServices();
    const settingsBag = context.plugin.settings as unknown as Record<string, unknown>;
    const copilotSettings = getCopilotProviderSettings(settingsBag);
    const hostnameKey = getHostnameKey();

    const recycleCopilotRuntime = async (): Promise<void> => {
      for (const view of context.plugin.getAllViews()) {
        const tabManager = view.getTabManager();
        if (tabManager?.broadcastToProviderTabs) {
          await tabManager.broadcastToProviderTabs('copilot', service => Promise.resolve(service.cleanup()));
        } else {
          await tabManager?.broadcastToAllTabs(service => Promise.resolve(service.cleanup()));
        }
        view.invalidateProviderCommandCaches?.(['copilot']);
        view.refreshModelSelector?.();
      }
    };

    const saveAndRecycle = async (): Promise<void> => {
      await context.plugin.saveSettings();
      await recycleCopilotRuntime();
      context.refreshModelSelectors();
    };

    new Setting(container).setName(tt('settings.setup', 'Setup')).setHeading();

    new Setting(container)
      .setName(tt('settings.copilot.enable.name', 'Enable Copilot provider'))
      .setDesc(tt('settings.copilot.enable.desc', 'Launch GitHub Copilot CLI as an ACP provider.'))
      .addToggle(toggle => toggle
        .setValue(copilotSettings.enabled)
        .onChange(async (value) => {
          updateCopilotProviderSettings(settingsBag, { enabled: value });
          await context.plugin.saveSettings();
          context.refreshModelSelectors();
        }));

    const cliPathSetting = new Setting(container)
      .setName(tt('settings.copilot.cliPath.name', 'Copilot CLI path ({host})').replace('{host}', hostnameKey))
      .setDesc(tt('settings.copilot.cliPath.desc', 'Absolute path to GitHub Copilot CLI on this computer. Leave empty to use `copilot` from PATH.'));

    const validationEl = container.createDiv({ cls: 'claudian-cli-path-validation' });
    validationEl.style.color = 'var(--text-error)';
    validationEl.style.fontSize = '0.85em';
    validationEl.style.marginTop = '-0.5em';
    validationEl.style.marginBottom = '0.5em';
    validationEl.style.display = 'none';

    const validatePath = (value: string): string | null => {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const expandedPath = expandHomePath(trimmed);
      if (!fs.existsSync(expandedPath)) return tt('settings.cliPath.validation.notExist', 'Path does not exist.');
      if (!fs.statSync(expandedPath).isFile()) return tt('settings.cliPath.validation.isDirectory', 'Path is a directory.');
      return null;
    };

    const updateCliPathValidation = (value: string, inputEl?: HTMLInputElement): boolean => {
      const error = validatePath(value);
      if (error) {
        validationEl.setText(error);
        validationEl.style.display = 'block';
        if (inputEl) inputEl.style.borderColor = 'var(--text-error)';
        return false;
      }
      validationEl.style.display = 'none';
      if (inputEl) inputEl.style.borderColor = '';
      return true;
    };

    const cliPathsByHost = { ...copilotSettings.cliPathsByHost };
    const currentValue = copilotSettings.cliPathsByHost[hostnameKey] || '';
    let cliPathInputEl: HTMLInputElement | null = null;
    const persistCliPath = async (value: string): Promise<boolean> => {
      if (!updateCliPathValidation(value, cliPathInputEl ?? undefined)) return false;
      const trimmed = value.trim();
      if (trimmed) cliPathsByHost[hostnameKey] = trimmed;
      else delete cliPathsByHost[hostnameKey];
      updateCopilotProviderSettings(settingsBag, { cliPathsByHost: { ...cliPathsByHost } });
      await context.plugin.saveSettings();
      copilotWorkspace?.cliResolver?.reset();
      await recycleCopilotRuntime();
      return true;
    };

    cliPathSetting.addText(text => {
      text
        .setPlaceholder(process.platform === 'win32' ? 'C:\\Users\\you\\.local\\bin\\copilot.exe' : '/Users/you/.local/bin/copilot')
        .setValue(currentValue)
        .onChange(async value => { await persistCliPath(value); });
      text.inputEl.addClass('claudian-settings-cli-path-input');
      text.inputEl.style.width = '100%';
      cliPathInputEl = text.inputEl;
      updateCliPathValidation(currentValue, text.inputEl);
    });

    new Setting(container).setName(tt('settings.safety', 'Safety')).setHeading();
    new Setting(container)
      .setName(tt('settings.copilot.approvalMode.name', 'Permission mode'))
      .setDesc(tt('settings.copilot.approvalMode.desc', 'Maps to Copilot CLI safe defaults, --mode plan, or --allow-all.'))
      .addDropdown(dropdown => dropdown
        .addOption('default', tt('settings.copilot.approvalMode.default', 'Safe'))
        .addOption('yolo', 'YOLO')
        .addOption('plan', tt('settings.copilot.approvalMode.plan', 'Plan'))
        .setValue(copilotSettings.selectedApprovalMode)
        .onChange(async (value) => {
          updateCopilotProviderSettings(settingsBag, { selectedApprovalMode: value as CopilotApprovalMode });
          await saveAndRecycle();
        }));

    new Setting(container)
      .setName(tt('settings.copilot.autopilot.name', 'Autopilot mode'))
      .setDesc(tt('settings.copilot.autopilot.desc', 'Start Copilot with --autopilot when not in Plan mode.'))
      .addToggle(toggle => toggle.setValue(copilotSettings.autopilot).onChange(async (value) => {
        updateCopilotProviderSettings(settingsBag, { autopilot: value });
        await saveAndRecycle();
      }));

    new Setting(container).setName(tt('settings.models', 'Models')).setHeading();
    const visibleModels = copilotSettings.visibleModels.length > 0
      ? copilotSettings.visibleModels
      : COPILOT_FALLBACK_MODELS.map(model => model.rawId);
    new Setting(container)
      .setName(tt('settings.copilot.customVisibleModels.name', 'Model IDs'))
      .setDesc(tt('settings.copilot.customVisibleModels.desc', 'One Copilot CLI model ID per line. These are passed to `copilot --model`.'))
      .addTextArea(text => {
        text.setPlaceholder('claude-sonnet-4.6\ngpt-5.5\ngpt-5.4\ngpt-5.4-mini')
          .setValue(visibleModels.join('\n'))
          .onChange(async (value) => {
            const models = parseLines(value);
            updateCopilotProviderSettings(settingsBag, { visibleModels: models });
            await context.plugin.saveSettings();
            const savedProviderModel = settingsBag.savedProviderModel as Record<string, unknown> | undefined;
            if (!settingsBag.model && models[0]) settingsBag.model = encodeCopilotModelId(models[0]);
            if (savedProviderModel && !savedProviderModel.copilot && models[0]) savedProviderModel.copilot = encodeCopilotModelId(models[0]);
            context.refreshModelSelectors();
          });
        text.inputEl.rows = 5;
        text.inputEl.cols = 40;
      });

    new Setting(container).setName(tt('settings.experimental', 'Advanced')).setHeading();
    new Setting(container)
      .setName(tt('settings.copilot.experimental.name', 'Experimental features'))
      .setDesc('Pass --experimental to Copilot CLI.')
      .addToggle(toggle => toggle.setValue(copilotSettings.experimental).onChange(async (value) => {
        updateCopilotProviderSettings(settingsBag, { experimental: value });
        await saveAndRecycle();
      }));
    new Setting(container)
      .setName(tt('settings.copilot.remote.name', 'Remote control'))
      .setDesc('Pass --remote; disabled by default with --no-remote for local Obsidian sessions.')
      .addToggle(toggle => toggle.setValue(copilotSettings.remote).onChange(async (value) => {
        updateCopilotProviderSettings(settingsBag, { remote: value });
        await saveAndRecycle();
      }));
    new Setting(container)
      .setName(tt('settings.copilot.reasoningSummaries.name', 'Reasoning summaries'))
      .setDesc('Pass --enable-reasoning-summaries for OpenAI models.')
      .addToggle(toggle => toggle.setValue(copilotSettings.enableReasoningSummaries).onChange(async (value) => {
        updateCopilotProviderSettings(settingsBag, { enableReasoningSummaries: value });
        await saveAndRecycle();
      }));
    new Setting(container)
      .setName(tt('settings.copilot.agent.name', 'Custom agent'))
      .setDesc('Optional --agent value.')
      .addText(text => text.setValue(copilotSettings.customAgent).setPlaceholder('agent-name').onChange(async (value) => {
        updateCopilotProviderSettings(settingsBag, { customAgent: value.trim() });
        await saveAndRecycle();
      }));

    const addTextAreaSetting = (
      name: string,
      desc: string,
      value: string,
      key: keyof ReturnType<typeof getCopilotProviderSettings>,
      placeholder: string,
    ): void => {
      new Setting(container)
        .setName(name)
        .setDesc(desc)
        .addTextArea(text => {
          text.setValue(value).setPlaceholder(placeholder).onChange(async (next) => {
            updateCopilotProviderSettings(settingsBag, { [key]: next } as Partial<ReturnType<typeof getCopilotProviderSettings>>);
            await saveAndRecycle();
          });
          text.inputEl.rows = 3;
          text.inputEl.cols = 40;
        });
    };

    addTextAreaSetting('Additional MCP config', 'One JSON string or @file path per line. Passed as repeated --additional-mcp-config.', copilotSettings.additionalMcpConfig, 'additionalMcpConfig', '@/path/to/mcp.json');
    addTextAreaSetting('GitHub MCP tools', 'One tool per line. Passed as repeated --add-github-mcp-tool.', copilotSettings.githubMcpTools, 'githubMcpTools', '*');
    addTextAreaSetting('GitHub MCP toolsets', 'One toolset per line. Passed as repeated --add-github-mcp-toolset.', copilotSettings.githubMcpToolsets, 'githubMcpToolsets', 'all');
    addTextAreaSetting('Allowed tools', 'One tool permission pattern per line. Passed as repeated --allow-tool.', copilotSettings.allowTools, 'allowTools', 'shell(git:*)\nwrite');
    addTextAreaSetting('Denied tools', 'One tool permission pattern per line. Passed as repeated --deny-tool.', copilotSettings.denyTools, 'denyTools', 'shell(git push)');
    addTextAreaSetting('Available tools', 'Restrict the model to these tools, one per line. Passed as repeated --available-tools.', copilotSettings.availableTools, 'availableTools', 'read\nedit');
    addTextAreaSetting('Allowed URLs', 'One URL/domain per line. Passed as repeated --allow-url.', copilotSettings.allowUrls, 'allowUrls', 'github.com');
    addTextAreaSetting('Denied URLs', 'One URL/domain per line. Passed as repeated --deny-url.', copilotSettings.denyUrls, 'denyUrls', 'example.com');

    new Setting(container).setName(tt('settings.mcpServers.name', 'MCP Servers')).setHeading();
    container.createEl('p', {
      cls: 'setting-item-description',
      text: 'Copilot CLI manages MCP through its own config and launch flags. Configure persistent MCP with `copilot mcp`; use fields above for per-session MCP extras.',
    });

    renderEnvironmentSettingsSection({
      container,
      plugin: context.plugin,
      scope: 'provider:copilot',
      heading: tt('settings.environment', 'Environment'),
      name: tt('settings.copilot.environment.name', 'Copilot environment'),
      desc: tt('settings.copilot.environment.desc', 'Copilot-owned runtime variables only. Shared PATH changes should go in shared environment settings.'),
      placeholder: 'GITHUB_TOKEN=...\nCOPILOT_LOG_LEVEL=info',
      renderCustomContextLimits: target => context.renderCustomContextLimits(target, 'copilot'),
    });
  },
};
