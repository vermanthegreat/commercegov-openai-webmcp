import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCommerceGovClient } from './commercegov/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = createCommerceGovClient();

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function body(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  return data ? JSON.parse(data) : {};
}

async function staticFile(res, pathname) {
  const files = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/webmcp.js': 'webmcp.js', '/styles.css': 'styles.css' };
  const filename = files[pathname];
  if (!filename) return false;
  const content = await readFile(path.join(__dirname, 'public', filename));
  const contentType = filename.endsWith('.css') ? 'text/css' : filename.endsWith('.js') ? 'text/javascript' : 'text/html';
  res.writeHead(200, { 'content-type': `${contentType}; charset=utf-8` });
  res.end(content);
  return true;
}

// These are local skeleton/BFF routes, not canonical CommerceGov production API routes.
export const app = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const match = (pattern) => url.pathname.match(pattern);
    if (req.method === 'GET' && url.pathname === '/api/products') return json(res, 200, await client.searchProducts({ query: url.searchParams.get('query') ?? '', limit: url.searchParams.get('limit') ?? 10 }));
    let route = match(/^\/api\/products\/([^/]+)\/context$/);
    if (req.method === 'GET' && route) {
      const value = await client.getGovernanceContext(route[1]);
      return json(res, value ? 200 : 404, value ?? { error: 'Product not found' });
    }
    route = match(/^\/api\/products\/([^/]+)\/proposals$/);
    if (req.method === 'POST' && route) {
      const value = await client.proposeChange(route[1], await body(req));
      return json(res, 201, value);
    }
    route = match(/^\/api\/proposals\/([^/]+)\/audit$/);
    if (req.method === 'GET' && route) {
      const value = await client.getAuditEvidence(route[1]);
      return json(res, value ? 200 : 404, value ?? { error: 'Proposal not found' });
    }
    route = match(/^\/api\/proposals\/([^/]+)$/);
    if (req.method === 'GET' && route) {
      const value = await client.getChangeStatus(route[1]);
      return json(res, value ? 200 : 404, value ?? { error: 'Proposal not found' });
    }
    if (req.method === 'GET' && await staticFile(res, url.pathname)) return;
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    json(res, Number.isInteger(error.status) ? error.status : 400, { error: error.message, code: error.code || 'request_failed' });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`CommerceGov WebMCP skeleton listening on http://localhost:${port}`));
}
