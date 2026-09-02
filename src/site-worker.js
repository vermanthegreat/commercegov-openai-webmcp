import { createCommerceGovClient } from './commercegov/client.js';
import { WEBMCP_TOOL_COUNT, normalizePublicError } from './commercegov/contracts.js';

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function staticResponse(file) {
  return new Response(file.body, {
    status: 200,
    headers: { 'content-type': `${file.contentType}; charset=utf-8` }
  });
}

export function createSiteWorker(staticFiles) {
  const sandboxClients = new Map();

  function clientFor(env, mode) {
    if (!['mock', 'dev', 'development', 'judge_sandbox'].includes(mode)) {
      return createCommerceGovClient({ env, fetchImpl: globalThis.fetch });
    }
    const scope = JSON.stringify([
      mode,
      String(env.COMMERCEGOV_AGENCY_ID || 'demo-agency'),
      String(env.COMMERCEGOV_SHOP || 'demo.myshopify.com')
    ]);
    if (!sandboxClients.has(scope)) sandboxClients.set(scope, createCommerceGovClient({ env, fetchImpl: globalThis.fetch }));
    return sandboxClients.get(scope);
  }

  return {
    async fetch(request, env) {
      try {
        const url = new URL(request.url);
        const match = (pattern) => url.pathname.match(pattern);
        const mode = String(env.COMMERCEGOV_MODE ?? '').trim().toLowerCase();
        const client = clientFor(env, mode);

        if (request.method === 'GET' && url.pathname === '/health') {
          return json(200, { status: 'ok', mode, webmcp_tools: WEBMCP_TOOL_COUNT, backend: mode === 'real' ? 'degraded' : 'ready' });
        }

        if (request.method === 'GET' && url.pathname === '/api/products') {
          return json(200, await client.searchProducts({
            query: url.searchParams.get('query') ?? '',
            limit: url.searchParams.get('limit') ?? 10
          }));
        }

        let route = match(/^\/api\/products\/([^/]+)\/context$/);
        if (request.method === 'GET' && route) {
          const value = await client.getGovernanceContext(route[1]);
          return json(value ? 200 : 404, value ?? { error: 'Product not found' });
        }

        route = match(/^\/api\/products\/([^/]+)\/proposals$/);
        if (request.method === 'POST' && route) {
          const payload = await request.json();
          return json(201, await client.proposeChange(route[1], payload));
        }

        route = match(/^\/api\/proposals\/([^/]+)\/audit$/);
        if (request.method === 'GET' && route) {
          const value = await client.getAuditEvidence(route[1]);
          return json(value ? 200 : 404, value ?? { error: 'Proposal not found' });
        }

        route = match(/^\/api\/proposals\/([^/]+)$/);
        if (request.method === 'GET' && route) {
          const value = await client.getChangeStatus(route[1]);
          return json(value ? 200 : 404, value ?? { error: 'Proposal not found' });
        }

        if (request.method === 'GET' && staticFiles[url.pathname]) {
          return staticResponse(staticFiles[url.pathname]);
        }
        return json(404, { error: 'Not found' });
      } catch (error) {
        const safe = normalizePublicError(error);
        return json(Number.isInteger(error.status) ? error.status : 500, safe);
      }
    }
  };
}
