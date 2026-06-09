import * as fs from 'fs';
import { Setting } from 'obsidian';

import type { ProviderSettingsTabRenderer } from '../../../core/providers/types';
import { renderEnvironmentSettingsSection } from '../../../features/settings/ui/EnvironmentSettingsSection';
import { t } from '../../../i18n/i18n';
import { getHostnameKey } from '../../../utils/env';
import { expandHomePath } from '../../../utils/path';
import { maybeGetFreebuffWorkspaceServices } from '../app/FreebuffWorkspaceServices';
import { encodeFreebuffModelId, FREEBUFF_MODEL_OPTIONS, type FreebuffModelId,normalizeFreebuffModelId } from '../models';
import { getFreebuffProviderSettings, updateFreebuffProviderSettings } from '../settings';

const tt = (key: string, fallback: string): string => {
  const value = t(key as any);
  return value === key ? fallback : value;
};

export const freebuffSettingsTabRenderer: ProviderSettingsTabRenderer = {
  render(container, context) {
    const freebuffWorkspace = maybeGetFreebuffWorkspaceServices();
    const settingsBag = context.plugin.settings as unknown as Record<string, unknown>;
    const freebuffSettings = getFreebuffProviderSettings(settingsBag);
    const hostnameKey = getHostnameKey();

    const recycleFreebuffRuntime = async (): Promise<void> => {
      for (const view of context.plugin.getAllViews()) {
        const tabManager = view.getTabManager();
        if (tabManager?.broadcastToProviderTabs) {
          await tabManager.broadcastToProviderTabs('freebuff', service => Promise.resolve(service.cleanup()));
        } else {
          await tabManager?.broadcastToAllTabs(service => Promise.resolve(service.cleanup()));
        }
        view.invalidateProviderCommandCaches?.(['freebuff']);
        view.refreshModelSelector?.();
      }
    };

    new Setting(container).setName(tt('settings.setup', 'Setup')).setHeading();

    new Setting(container)
      .setName(tt('settings.freebuff.enable.name', 'Enable Freebuff provider'))
      .setDesc(tt('settings.freebuff.enable.desc', 'Run Freebuff CLI as an iClaudian provider.'))
      .addToggle(toggle => toggle
        .setValue(freebuffSettings.enabled)
        .onChange(async (value) => {
          updateFreebuffProviderSettings(settingsBag, { enabled: value });
          await context.plugin.saveSettings();
          context.refreshModelSelectors();
        }));

    const cliPathSetting = new Setting(container)
      .setName(tt('settings.freebuff.cliPath.name', 'Freebuff CLI path ({host})').replace('{host}', hostnameKey))
      .setDesc(tt('settings.freebuff.cliPath.desc', 'Optional absolute path to the Freebuff CLI for this computer. Leave empty to use the selected mode default from PATH.'));

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
      if (!fs.statSync(expandedPath).isFile()) return tt('settings.cliPath.validation.isDirectory', 'Path must point to a file.');
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

    const cliPathsByHost = { ...freebuffSettings.cliPathsByHost };
    const currentValue = freebuffSettings.cliPathsByHost[hostnameKey] || '';
    let cliPathInputEl: HTMLInputElement | null = null;
    const persistCliPath = async (value: string): Promise<boolean> => {
      if (!updateCliPathValidation(value, cliPathInputEl ?? undefined)) return false;
      const trimmed = value.trim();
      if (trimmed) cliPathsByHost[hostnameKey] = trimmed;
      else delete cliPathsByHost[hostnameKey];
      updateFreebuffProviderSettings(settingsBag, { cliPathsByHost: { ...cliPathsByHost } });
      await context.plugin.saveSettings();
      freebuffWorkspace?.cliResolver?.reset();
      await recycleFreebuffRuntime();
      return true;
    };

    cliPathSetting.addText(text => {
      text
        .setPlaceholder(process.platform === 'win32' ? 'C:\\Users\\you\\AppData\\Roaming\\npm\\freebuff.cmd' : '/usr/local/bin/freebuff')
        .setValue(currentValue)
        .onChange(async value => { await persistCliPath(value); });
      text.inputEl.addClass('claudian-settings-cli-path-input');
      text.inputEl.style.width = '100%';
      cliPathInputEl = text.inputEl;
      updateCliPathValidation(currentValue, text.inputEl);
    });

    new Setting(container).setName(tt('settings.models', 'Models')).setHeading();
    new Setting(container)
      .setName(tt('settings.freebuff.mode.name', 'Default Freebuff mode'))
      .setDesc(tt('settings.freebuff.mode.desc', 'This is used as the model/mode when Freebuff is selected. iClaudian writes the selected model to Freebuff native settings before launch so the CLI does not ask again in the terminal.'))
      .addDropdown(dropdown => {
        for (const option of FREEBUFF_MODEL_OPTIONS) {
          dropdown.addOption(option.modelId, option.label);
        }
        dropdown
          .setValue(freebuffSettings.selectedMode)
          .onChange(async (value) => {
            const selectedMode = normalizeFreebuffModelId(value) as FreebuffModelId;
            updateFreebuffProviderSettings(settingsBag, { selectedMode });
            settingsBag.model = encodeFreebuffModelId(selectedMode);
            const savedProviderModel = settingsBag.savedProviderModel as Record<string, unknown> | undefined;
            if (savedProviderModel) savedProviderModel.freebuff = encodeFreebuffModelId(selectedMode);
            await context.plugin.saveSettings();
            context.refreshModelSelectors();
            await recycleFreebuffRuntime();
          });
      });

    const modelDesc = container.createDiv({ cls: 'claudian-sp-settings-desc' });
    modelDesc.createEl('p', {
      cls: 'setting-item-description',
      text: tt('settings.freebuff.modes.desc', 'Freebuff uses the `freebuff` binary and stores the selected model in ~/.config/manicode/settings.json before each run.'),
    });

    new Setting(container).setName(tt('settings.mcpServers.name', 'MCP servers')).setHeading();
    const mcpNotice = container.createDiv({ cls: 'claudian-mcp-settings-desc' });
    mcpNotice.createEl('p', {
      cls: 'setting-item-description',
      text: tt('settings.freebuff.mcp.desc', 'Freebuff manages tools, browser use, and MCP-like capabilities inside its own CLI. Configure them in the CLI; iClaudian passes the prompt through the provider runtime.'),
    });

    renderEnvironmentSettingsSection({
      container,
      plugin: context.plugin,
      scope: 'provider:freebuff',
      heading: tt('settings.environment', 'Environment'),
      name: tt('settings.freebuff.environment.name', 'Freebuff environment'),
      desc: tt('settings.freebuff.environment.desc', 'Freebuff-owned runtime variables only. Put shared PATH changes in shared environment settings.'),
      placeholder: 'FREEBUFF_API_KEY=your-key',
      renderCustomContextLimits: target => context.renderCustomContextLimits(target, 'freebuff'),
    });
  },
};
