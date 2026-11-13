import { mkdirSync, copyFileSync } from 'node:fs';
for (const route of ['studio', 'lab', 'lab/operations', 'sensing', 'communication']) {
  mkdirSync(`dist/${route}`, { recursive: true });
  copyFileSync('dist/index.html', `dist/${route}/index.html`);
}
