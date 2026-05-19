import * as fs from 'fs';
import * as path from 'path';

const filesToUpdate = [
  'src/providers/antigravity/runtime/AntigravityChatRuntime.ts',
  'src/i18n/locales/zh-CN.json',
  'src/i18n/locales/en.json',
  'src/i18n/locales/de.json',
  'src/i18n/locales/es.json',
  'src/i18n/locales/fr.json',
  'src/i18n/locales/ja.json',
  'src/i18n/locales/ko.json',
  'src/i18n/locales/pt.json',
  'src/i18n/locales/ru.json',
  'src/i18n/locales/zh-TW.json',
];

for (const file of filesToUpdate) {
  const filePath = path.resolve(file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    if (file.endsWith('.json')) {
      // For locales, replace "antigravity --acp" with "agy --acp"
      content = content.replace(/antigravity --acp/g, 'agy --acp');
      content = content.replace(/PATH 中的 `antigravity`/g, 'PATH 中的 `agy`');
      content = content.replace(/PATH's `antigravity`/g, 'PATH\'s `agy`');
      content = content.replace(/antigravity mcp/g, 'agy mcp');
    } else if (file.endsWith('AntigravityChatRuntime.ts')) {
      content = content.replace(/resolvedCliPath = this.plugin.getResolvedProviderCliPath\('antigravity'\) \?\? 'antigravity'/g, 'resolvedCliPath = this.plugin.getResolvedProviderCliPath(\'antigravity\') ?? \'agy\'');
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${file}`);
  }
}
