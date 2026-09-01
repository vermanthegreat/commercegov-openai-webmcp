import {
  CommerceGovContractError,
  assertBinding,
  assertCommerceGovClient,
  assertProposeOnlyPayload
} from './contracts.js';

const MAX_SEARCH_PAGES = 10;
const PAGE_SIZE = 100;

export class CommerceGovApiError extends Error {
  constructor(code, message, { status = 502, retryable = false, requestId = null, retryAfterSeconds = null } = {}) {
    super(message);
    this.name = 'CommerceGovApiError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.requestId = requestId;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function required(value, name) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new CommerceGovApiError('configuration_error', `${name} is required`, { status: 500 });
  return normalized;
}

function normalizeBaseUrl(value) {
  const raw = required(value, 'COMMERCEGOV_API_URL');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new CommerceGovApiError('configuration_error', 'COMMERCEGOV_API_URL must be an absolute URL', { status: 500 });
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new CommerceGovApiError('configuration_error', 'COMMERCEGOV_API_URL is invalid', { status: 500 });
  }
  return parsed.toString().replace(/\/$/, '');
}

function normalizeShop(value) {
  const shop = required(value, 'COMMERCEGOV_SHOP').toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/.test(shop)) {
    throw new CommerceGovApiError('configuration_error', 'COMMERCEGOV_SHOP must be a canonical myshopify.com domain', { status: 500 });
  }
  return shop;
}

function positiveId(value, kind) {
  const id = String(value ?? '');
  if (!/^[1-9]\d{0,19}$/.test(id)) throw new CommerceGovContractError(`invalid_${kind}_id`, `Invalid ${kind} identifier`);
  return id;
}

function ensureEcho(actual, expected, field) {
  if (String(actual ?? '') !== String(expected)) {
    throw new CommerceGovApiError('binding_mismatch', `CommerceGov returned an unexpected ${field}`, { status: 502 });
  }
}

export function createCommerceGovApi({ baseUrl, token, agency, shop, timeoutMs = 5000, fetchImpl = globalThis.fetch } = {}) {
  const binding = Object.freeze({ agency: required(agency, 'COMMERCEGOV_AGENCY_ID'), shop: normalizeShop(shop) });
  const apiUrl = normalizeBaseUrl(baseUrl);
  const apiToken = required(token, 'COMMERCEGOV_API_TOKEN');
  const timeout = Number(timeoutMs);
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30000) {
    throw new CommerceGovApiError('configuration_error', 'COMMERCEGOV_API_TIMEOUT_MS must be between 1 and 30000', { status: 500 });
  }
  if (typeof fetchImpl !== 'function') throw new CommerceGovApiError('configuration_error', 'A fetch implementation is required', { status: 500 });

  async function request(path, { method = 'GET', body } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let response;
    try {
      response = await fetchImpl(`${apiUrl}/api/integration/v1${path}`, {
        method,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${apiToken}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' })
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
    } catch (error) {
      const code = error?.name === 'AbortError' ? 'timeout' : 'transport_error';
      throw new CommerceGovApiError(code, code === 'timeout' ? 'CommerceGov request timed out' : 'CommerceGov request failed', { status: 503, retryable: true });
    } finally {
      clearTimeout(timer);
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new CommerceGovApiError('invalid_response', 'CommerceGov returned invalid JSON', { status: 502 });
    }
    if (!response.ok) {
      const error = payload?.error ?? {};
      throw new CommerceGovApiError(
        String(error.code || 'upstream_error'),
        String(error.message || 'CommerceGov request failed'),
        {
          status: response.status,
          retryable: Boolean(error.retryable),
          requestId: error.request_id || null,
          retryAfterSeconds: error.retry_after_seconds ?? null
        }
      );
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new CommerceGovApiError('invalid_response', 'CommerceGov returned an invalid response', { status: 502 });
    }
    return payload;
  }

  const shopPath = `/shops/${encodeURIComponent(binding.shop)}`;
  const client = {
    async searchProducts({ query = '', limit = 10, ...requestedBinding } = {}) {
      assertBinding(binding, requestedBinding);
      const requestedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 10, 1), 100);
      const needle = String(query).trim().toLowerCase();
      const products = [];
      for (let pageNumber = 0; pageNumber < MAX_SEARCH_PAGES && products.length < requestedLimit; pageNumber += 1) {
        const offset = pageNumber * PAGE_SIZE;
        const page = await request(`${shopPath}/products?limit=${PAGE_SIZE}&offset=${offset}`);
        ensureEcho(page.shop_id, binding.shop, 'shop');
        if (!Array.isArray(page.products)) throw new CommerceGovApiError('invalid_response', 'CommerceGov products response is invalid', { status: 502 });
        for (const product of page.products) {
          if (!needle || String(product.title || '').toLowerCase().includes(needle) || String(product.product_id || '').toLowerCase().includes(needle)) {
            products.push({ product_id: String(product.product_id), title: String(product.title), stage: String(product.stage) });
            if (products.length >= requestedLimit) break;
          }
        }
        if (!page.has_more) break;
      }
      return { products };
    },

    async getGovernanceContext(productId, requestedBinding = {}) {
      assertBinding(binding, requestedBinding);
      const product = positiveId(productId, 'product');
      const [content, policy] = await Promise.all([
        request(`${shopPath}/products/${product}/content`),
        request(`${shopPath}/policy`)
      ]);
      ensureEcho(content.shop_id, binding.shop, 'shop');
      ensureEcho(policy.shop_id, binding.shop, 'shop');
      ensureEcho(content.product_id, product, 'product');
      return {
        product_id: product,
        current: { ...content.content },
        stage: content.stage,
        policy: {
          schema_version: policy.schema_version,
          effective_policy_hash: policy.effective_policy_hash,
          controlled_fields: [...policy.controlled_fields],
          ...policy.rules
        },
        authority: { agent: ['read', 'analyze', 'propose'], approve: 'human_required', apply: 'human_required' }
      };
    },

    async proposeChange(productId, payload = {}) {
      assertBinding(binding, payload);
      const product = positiveId(productId, 'product');
      const proposal = assertProposeOnlyPayload(payload);
      const result = await request(`${shopPath}/products/${product}/proposals`, { method: 'POST', body: proposal });
      ensureEcho(result.shop_id, binding.shop, 'shop');
      ensureEcho(result.product_id, product, 'product');
      if (result.stage !== 'review' || result.review_state !== 'Review/pending') {
        throw new CommerceGovApiError('authority_violation', 'CommerceGov did not return a review-only proposal', { status: 502 });
      }
      return {
        ...result,
        change_id: String(result.proposal_id),
        status: result.stage,
        agency: binding.agency,
        shop: binding.shop,
        target: { type: 'product', product_id: product },
        mutation_class: 'product_content_proposal',
        proposed_value: proposal.changes,
        next_required_authority: 'human_review'
      };
    },

    async getChangeStatus(proposalId, requestedBinding = {}) {
      assertBinding(binding, requestedBinding);
      const id = positiveId(proposalId, 'proposal');
      const result = await request(`/proposals/${id}`);
      ensureEcho(result.proposal_id, id, 'proposal');
      return { proposal_id: id, state: String(result.state) };
    },

    async getAuditEvidence(proposalId, requestedBinding = {}) {
      assertBinding(binding, requestedBinding);
      const id = positiveId(proposalId, 'proposal');
      const result = await request(`/proposals/${id}/trace`);
      ensureEcho(result.proposal_id, id, 'proposal');
      if (!Array.isArray(result.events)) throw new CommerceGovApiError('invalid_response', 'CommerceGov trace response is invalid', { status: 502 });
      return {
        proposal_id: id,
        events: result.events.map(({ event, state, at }) => ({ event, state, at })),
        truncated: Boolean(result.truncated),
        complete: Boolean(result.complete),
        returned_count: Number(result.returned_count)
      };
    }
  };
  return assertCommerceGovClient(client);
}
