// Writes public/version.js before a deploy. A new version makes the offline copy update (see public/sw.js).
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const sha = execSync('git rev-parse --short HEAD').toString().trim();
const version = `${sha}-${Date.now()}`;
writeFileSync(new URL('../public/version.js', import.meta.url), `self.VERSION = '${version}';\n`);
console.log('version', version);
