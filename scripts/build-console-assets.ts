import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, type HtmlShareConfig } from '../src/config.js';
import { loadSiteTheme, THEMED_SCREENS, themeShell } from '../src/theme.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 静的アセットの内容はデプロイ時に固定し、Worker runtime ではファイルを生成しない。
export function buildConsoleAssets(config: HtmlShareConfig, destination = path.join(root, '.html-share', 'console-assets')): void {
  const source = path.join(root, 'web');
  const theme = loadSiteTheme(config);
  // 出力先は呼び出し元が指定する専用の生成ディレクトリ。
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  cpSync(source, destination, { recursive: true });
  for (const screen of THEMED_SCREENS) {
    const file = path.join(destination, screen);
    writeFileSync(file, themeShell(readFileSync(file, 'utf8'), theme, screen));
  }
  const file = path.join(destination, 'app.webmanifest');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  manifest.theme_color = theme.base;
  manifest.background_color = theme.background;
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildConsoleAssets(loadConfig());
}
