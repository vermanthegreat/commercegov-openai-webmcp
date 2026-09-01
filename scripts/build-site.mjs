import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(projectRoot, 'dist', 'server');
const publicDir = path.join(projectRoot, 'src', 'public');
const definitions = {
  '/': ['index.html', 'text/html'],
  '/index.html': ['index.html', 'text/html'],
  '/app.js': ['app.js', 'text/javascript'],
  '/webmcp.js': ['webmcp.js', 'text/javascript'],
  '/styles.css': ['styles.css', 'text/css']
};

await rm(path.join(projectRoot, 'dist'), { recursive: true, force: true });
await mkdir(serverDir, { recursive: true });
await cp(path.join(projectRoot, 'src', 'commercegov'), path.join(serverDir, 'commercegov'), { recursive: true });
await cp(path.join(projectRoot, 'src', 'site-worker.js'), path.join(serverDir, 'site-worker.js'));

const staticFiles = {};
for (const [route, [filename, contentType]] of Object.entries(definitions)) {
  staticFiles[route] = { body: await readFile(path.join(publicDir, filename), 'utf8'), contentType };
}

const entry = `import { createSiteWorker } from './site-worker.js';\n\nconst staticFiles = ${JSON.stringify(staticFiles)};\n\nexport default createSiteWorker(staticFiles);\n`;
await writeFile(path.join(serverDir, 'index.js'), entry, 'utf8');
