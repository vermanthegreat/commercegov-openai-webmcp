import { createMockCommerceGov } from './mock.js';
import { createCommerceGovApi, CommerceGovApiError } from './api.js';
import { assertCommerceGovClient } from './contracts.js';

export function createCommerceGovClient({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const mode = String(env.COMMERCEGOV_MODE ?? '').trim().toLowerCase();
  if (['mock', 'dev', 'development', 'judge_sandbox'].includes(mode)) {
    return assertCommerceGovClient(createMockCommerceGov({
      agency: String(env.COMMERCEGOV_AGENCY_ID || 'demo-agency'),
      shop: String(env.COMMERCEGOV_SHOP || 'demo.myshopify.com')
    }));
  }
  if (mode === 'real') {
    return createCommerceGovApi({
      baseUrl: env.COMMERCEGOV_API_URL,
      token: env.COMMERCEGOV_API_TOKEN,
      agency: env.COMMERCEGOV_AGENCY_ID,
      shop: env.COMMERCEGOV_SHOP,
      timeoutMs: env.COMMERCEGOV_API_TIMEOUT_MS || 5000,
      fetchImpl
    });
  }
  throw new CommerceGovApiError('configuration_error', 'COMMERCEGOV_MODE must explicitly be mock, dev, development, judge_sandbox, or real', { status: 500 });
}
