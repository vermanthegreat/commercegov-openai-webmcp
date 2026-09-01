import { createCommerceGovClient } from './commercegov/client.js';

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
  return {
    async fetch(request, env) {
      try {
        const client = createCommerceGovClient({ env, fetchImpl: globalThis.fetch });
        const url = new URL(request.url);
        const match = (pattern) => url.pathname.match(pattern);

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
        return json(Number.isInteger(error.status) ? error.status : 400, {
          error: error.message,
          code: error.code || 'request_failed'
        });
      }
    }
  };
}
