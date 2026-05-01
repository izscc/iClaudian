import * as fs from 'fs';
import { Setting } from 'obsidian';

import type { ProviderSettingsTabRenderer } from '../../../core/providers/types';
import { renderEnvironmentSettingsSection } from '../../../features/settings/ui/EnvironmentSettingsSection';
import { t } from '../../../i18n/i18n';
import { getHostnameKey } from '../../../utils/env';
import { expandHomePath } from '../../../utils/path';
import { maybeGetGeminiWorkspaceServices } from '../app/GeminiWorkspaceServices';
import { encodeGeminiModelId } from '../models';
import type { GeminiApprovalMode } from '../settings';
import { getGeminiProviderSettings, updateGeminiProviderSettings } from '../settings';

type I18nKey = Parameters<typeof t>[0];
const tt = (key: string): string => t(key as I18nKey);

export const geminiSettingsTabRenderer: ProviderSettingsTabRenderer = {
  render(container, context) {
    const geminiWorkspace = maybeGetGeminiWorkspaceServices();
    const settingsBag = context.plugin.settings as unknown as Record<string, unknown>;
    const geminiSettings = getGeminiProviderSettings(settingsBag);
    const hostnameKey = getHostnameKey();

    const recycleGeminiRuntime = async (): Promise<void> => {
      for (const view of context.plugin.getAllViews()) {
        const tabManager = view.getTabManager();
        if (tabManager?.broadcastToProviderTabs) {
          await tabManager.broadcastToProviderTabs('gemini', service => Promise.resolve(service.cleanup()));
        } else {
          await tabManager?.broadcastToAllTabs(service => Promise.resolve(service.cleanup()));
        }
        view.invalidateProviderCommandCaches?.(['gemini']);
        view.refreshModelSelector?.();
      }
    };

    new Setting(container).setName(tt('settings.setup')).setHeading();

    new Setting(container)
      .setName(tt('settings.gemini.enable.name'))
      .setDesc(tt('settings.gemini.enable.desc'))
      .addToggle(toggle => toggle
        .setValue(geminiSettings.enabled)
        .onChange(async (value) => {
          updateGeminiProviderSettings(settingsBag, { enabled: value });
          await context.plugin.saveSettings();
          context.refreshModelSelectors();
        }));

    const cliPathSetting = new Setting(container)
      .setName(tt('settings.gemini.cliPath.name').replace('{host}', hostnameKey))
      .setDesc(tt('settings.gemini.cliPath.desc'));

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
      if (!fs.existsSync(expandedPath)) return tt('settings.cliPath.validation.notExist');
      if (!fs.statSync(expandedPath).isFile()) return tt('settings.cliPath.validation.isDirectory');
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

    const cliPathsByHost = { ...geminiSettings.cliPathsByHost };
    const currentValue = geminiSettings.cliPathsByHost[hostnameKey] || '';
    let cliPathInputEl: HTMLInputElement | null = null;
    const persistCliPath = async (value: string): Promise<boolean> => {
      if (!updateCliPathValidation(value, cliPathInputEl ?? undefined)) return false;
      const trimmed = value.trim();
      if (trimmed) cliPathsByHost[hostnameKey] = trimmed;
      else delete cliPathsByHost[hostnameKey];
      updateGeminiProviderSettings(settingsBag, { cliPathsByHost: { ...cliPathsByHost } });
      await context.plugin.saveSettings();
      geminiWorkspace?.cliResolver?.reset();
      await recycleGeminiRuntime();
      return true;
    };

    cliPathSetting.addText(text => {
      text
        .setPlaceholder(process.platform === 'win32' ? 'C:\\Users\\you\\AppData\\Roaming\\npm\\gemini.cmd' : '/usr/local/bin/gemini')
        .setValue(currentValue)
        .onChange(async value => { await persistCliPath(value); });
      text.inputEl.addClass('claudian-settings-cli-path-input');
      text.inputEl.style.width = '100%';
      cliPathInputEl = text.inputEl;
      updateCliPathValidation(currentValue, text.inputEl);
    });

    new Setting(container).setName(tt('settings.safety')).setHeading();
    new Setting(container)
      .setName(tt('settings.gemini.approvalMode.name'))
      .setDesc(tt('settings.gemini.approvalMode.desc'))
      .addDropdown(dropdown => dropdown
        .addOption('default', tt('settings.gemini.approvalMode.default'))
        .addOption('auto_edit', tt('settings.gemini.approvalMode.autoEdit'))
        .addOption('yolo', 'YOLO')
        .addOption('plan', tt('settings.gemini.approvalMode.plan'))
        .setValue(geminiSettings.selectedApprovalMode)
        .onChange(async (value) => {
          updateGeminiProviderSettings(settingsBag, { selectedApprovalMode: value as GeminiApprovalMode });
          await context.plugin.saveSettings();
          await recycleGeminiRuntime();
        }));

    new Setting(container).setName(tt('settings.models')).setHeading();
    new Setting(container)
      .setName(tt('settings.gemini.visibleModels.name'))
      .setDesc(tt('settings.gemini.visibleModels.desc'));

    const visibleModels = geminiSettings.visibleModels.length > 0
      ? geminiSettings.visibleModels
      : geminiSettings.discoveredModels.map(model => model.rawId);
    const modelText = new Setting(container)
      .setName(tt('settings.gemini.customVisibleModels.name'))
      .setDesc(tt('settings.gemini.customVisibleModels.desc'));
    modelText.addTextArea(text => {
      text.setPlaceholder('auto-gemini-3\ngemini-2.5-pro\ngemini-2.5-flash')
        .setValue(visibleModels.join('\n'))
        .onChange(async (value) => {
          const models = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
          updateGeminiProviderSettings(settingsBag, { visibleModels: models });
          await context.plugin.saveSettings();
          const savedProviderModel = settingsBag.savedProviderModel as Record<string, unknown> | undefined;
          if (!settingsBag.model && models[0]) settingsBag.model = encodeGeminiModelId(models[0]);
          if (savedProviderModel && !savedProviderModel.gemini && models[0]) savedProviderModel.gemini = encodeGeminiModelId(models[0]);
          context.refreshModelSelectors();
        });
      text.inputEl.rows = 5;
      text.inputEl.cols = 40;
    });

    const discoveredDesc = container.createDiv({ cls: 'claudian-sp-settings-desc' });
    discoveredDesc.createEl('p', {
      cls: 'setting-item-description',
      text: geminiSettings.discoveredModels.length > 0
        ? tt('settings.gemini.discovered').replace('{count}', String(geminiSettings.discoveredModels.length))
        : tt('settings.gemini.notDiscovered'),
    });

    new Setting(container).setName(tt('settings.gemini.commandsSkills.name')).setHeading();
    container.createEl('p', {
      cls: 'setting-item-description',
      text: tt('settings.gemini.commandsSkills.desc'),
    });
    context.renderHiddenProviderCommandSetting(container, 'gemini', {
      name: tt('settings.gemini.hiddenCommands.name'),
      desc: tt('settings.gemini.hiddenCommands.desc'),
      placeholder: 'memory\ninit\nrestore',
    });

    new Setting(container).setName(tt('settings.mcpServers.name')).setHeading();
    const mcpNotice = container.createDiv({ cls: 'claudian-mcp-settings-desc' });
    mcpNotice.createEl('p', {
      cls: 'setting-item-description',
      text: tt('settings.gemini.mcp.desc'),
    });

    renderEnvironmentSettingsSection({
      container,
      plugin: context.plugin,
      scope: 'provider:gemini',
      heading: tt('settings.environment'),
      name: tt('settings.gemini.environment.name'),
      desc: tt('settings.gemini.environment.desc'),
      placeholder: 'GEMINI_API_KEY=your-key\nGOOGLE_CLOUD_PROJECT=your-project\nGOOGLE_GENAI_USE_VERTEXAI=true',
      renderCustomContextLimits: target => context.renderCustomContextLimits(target, 'gemini'),
    });
  },
};
