import * as fs from 'fs';
import { Setting } from 'obsidian';

import type { ProviderSettingsTabRenderer } from '../../../core/providers/types';
import { renderEnvironmentSettingsSection } from '../../../features/settings/ui/EnvironmentSettingsSection';
import { t } from '../../../i18n/i18n';
import { getHostnameKey } from '../../../utils/env';
import { expandHomePath } from '../../../utils/path';
import { maybeGetAntigravityWorkspaceServices } from '../app/AntigravityWorkspaceServices';
import { encodeAntigravityModelId } from '../models';
import type { AntigravityApprovalMode } from '../settings';
import { getAntigravityProviderSettings, updateAntigravityProviderSettings } from '../settings';

type I18nKey = Parameters<typeof t>[0];
const tt = (key: string): string => t(key as I18nKey);

export const antigravitySettingsTabRenderer: ProviderSettingsTabRenderer = {
  render(container, context) {
    const antigravityWorkspace = maybeGetAntigravityWorkspaceServices();
    const settingsBag = context.plugin.settings as unknown as Record<string, unknown>;
    const antigravitySettings = getAntigravityProviderSettings(settingsBag);
    const hostnameKey = getHostnameKey();

    const recycleAntigravityRuntime = async (): Promise<void> => {
      for (const view of context.plugin.getAllViews()) {
        const tabManager = view.getTabManager();
        if (tabManager?.broadcastToProviderTabs) {
          await tabManager.broadcastToProviderTabs('antigravity', service => Promise.resolve(service.cleanup()));
        } else {
          await tabManager?.broadcastToAllTabs(service => Promise.resolve(service.cleanup()));
        }
        view.invalidateProviderCommandCaches?.(['antigravity']);
        view.refreshModelSelector?.();
      }
    };

    new Setting(container).setName(tt('settings.setup')).setHeading();

    new Setting(container)
      .setName(tt('settings.antigravity.enable.name'))
      .setDesc(tt('settings.antigravity.enable.desc'))
      .addToggle(toggle => toggle
        .setValue(antigravitySettings.enabled)
        .onChange(async (value) => {
          updateAntigravityProviderSettings(settingsBag, { enabled: value });
          await context.plugin.saveSettings();
          context.refreshModelSelectors();
        }));

    const cliPathSetting = new Setting(container)
      .setName(tt('settings.antigravity.cliPath.name').replace('{host}', hostnameKey))
      .setDesc(tt('settings.antigravity.cliPath.desc'));

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

    const cliPathsByHost = { ...antigravitySettings.cliPathsByHost };
    const currentValue = antigravitySettings.cliPathsByHost[hostnameKey] || '';
    let cliPathInputEl: HTMLInputElement | null = null;
    const persistCliPath = async (value: string): Promise<boolean> => {
      if (!updateCliPathValidation(value, cliPathInputEl ?? undefined)) return false;
      const trimmed = value.trim();
      if (trimmed) cliPathsByHost[hostnameKey] = trimmed;
      else delete cliPathsByHost[hostnameKey];
      updateAntigravityProviderSettings(settingsBag, { cliPathsByHost: { ...cliPathsByHost } });
      await context.plugin.saveSettings();
      antigravityWorkspace?.cliResolver?.reset();
      await recycleAntigravityRuntime();
      return true;
    };

    cliPathSetting.addText(text => {
      text
        .setPlaceholder(process.platform === 'win32' ? 'C:\\Users\\you\\AppData\\Roaming\\npm\\antigravity.cmd' : '/usr/local/bin/antigravity')
        .setValue(currentValue)
        .onChange(async value => { await persistCliPath(value); });
      text.inputEl.addClass('claudian-settings-cli-path-input');
      text.inputEl.style.width = '100%';
      cliPathInputEl = text.inputEl;
      updateCliPathValidation(currentValue, text.inputEl);
    });

    new Setting(container).setName(tt('settings.safety')).setHeading();
    new Setting(container)
      .setName(tt('settings.antigravity.approvalMode.name'))
      .setDesc(tt('settings.antigravity.approvalMode.desc'))
      .addDropdown(dropdown => dropdown
        .addOption('default', tt('settings.antigravity.approvalMode.default'))
        .addOption('auto_edit', tt('settings.antigravity.approvalMode.autoEdit'))
        .addOption('yolo', 'YOLO')
        .addOption('plan', tt('settings.antigravity.approvalMode.plan'))
        .setValue(antigravitySettings.selectedApprovalMode)
        .onChange(async (value) => {
          updateAntigravityProviderSettings(settingsBag, { selectedApprovalMode: value as AntigravityApprovalMode });
          await context.plugin.saveSettings();
          await recycleAntigravityRuntime();
        }));

    new Setting(container).setName(tt('settings.models')).setHeading();
    new Setting(container)
      .setName(tt('settings.antigravity.visibleModels.name'))
      .setDesc(tt('settings.antigravity.visibleModels.desc'));

    const visibleModels = antigravitySettings.visibleModels.length > 0
      ? antigravitySettings.visibleModels
      : antigravitySettings.discoveredModels.map(model => model.rawId);
    const modelText = new Setting(container)
      .setName(tt('settings.antigravity.customVisibleModels.name'))
      .setDesc(tt('settings.antigravity.customVisibleModels.desc'));
    modelText.addTextArea(text => {
      text.setPlaceholder('auto-antigravity-3\nantigravity-2.5-pro\nantigravity-2.5-flash')
        .setValue(visibleModels.join('\n'))
        .onChange(async (value) => {
          const models = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
          updateAntigravityProviderSettings(settingsBag, { visibleModels: models });
          await context.plugin.saveSettings();
          const savedProviderModel = settingsBag.savedProviderModel as Record<string, unknown> | undefined;
          if (!settingsBag.model && models[0]) settingsBag.model = encodeAntigravityModelId(models[0]);
          if (savedProviderModel && !savedProviderModel.antigravity && models[0]) savedProviderModel.antigravity = encodeAntigravityModelId(models[0]);
          context.refreshModelSelectors();
        });
      text.inputEl.rows = 5;
      text.inputEl.cols = 40;
    });

    const discoveredDesc = container.createDiv({ cls: 'claudian-sp-settings-desc' });
    discoveredDesc.createEl('p', {
      cls: 'setting-item-description',
      text: antigravitySettings.discoveredModels.length > 0
        ? tt('settings.antigravity.discovered').replace('{count}', String(antigravitySettings.discoveredModels.length))
        : tt('settings.antigravity.notDiscovered'),
    });

    new Setting(container).setName(tt('settings.antigravity.commandsSkills.name')).setHeading();
    container.createEl('p', {
      cls: 'setting-item-description',
      text: tt('settings.antigravity.commandsSkills.desc'),
    });
    context.renderHiddenProviderCommandSetting(container, 'antigravity', {
      name: tt('settings.antigravity.hiddenCommands.name'),
      desc: tt('settings.antigravity.hiddenCommands.desc'),
      placeholder: 'memory\ninit\nrestore',
    });

    new Setting(container).setName(tt('settings.mcpServers.name')).setHeading();
    const mcpNotice = container.createDiv({ cls: 'claudian-mcp-settings-desc' });
    mcpNotice.createEl('p', {
      cls: 'setting-item-description',
      text: tt('settings.antigravity.mcp.desc'),
    });

    renderEnvironmentSettingsSection({
      container,
      plugin: context.plugin,
      scope: 'provider:antigravity',
      heading: tt('settings.environment'),
      name: tt('settings.antigravity.environment.name'),
      desc: tt('settings.antigravity.environment.desc'),
      placeholder: 'ANTIGRAVITY_API_KEY=your-key\nGOOGLE_CLOUD_PROJECT=your-project\nGOOGLE_GENAI_USE_VERTEXAI=true',
      renderCustomContextLimits: target => context.renderCustomContextLimits(target, 'antigravity'),
    });
  },
};
