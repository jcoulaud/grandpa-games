// Shared setup for the browser tests.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));

// The game is opened from disk, the way it runs on the PC.
export const URL = pathToFileURL(join(here, '..', 'public', 'games', 'solitaire', 'index.html')).href;

// Screenshots go to tests/screenshots, or to the folder in SHOTS.
export const OUT = process.env.SHOTS || join(here, 'screenshots');
mkdirSync(OUT, { recursive: true });

// CHROMIUM can name a browser binary when Playwright's own download is missing.
export const launch = () => chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
