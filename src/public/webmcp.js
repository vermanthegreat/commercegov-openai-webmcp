const ID = /^[1-9]\d{0,19}$/;
const KEY = /^[^\u0000-\u0020\u007f]+$/;
const FIELDS = new Set(['title', 'description', 'meta_title', 'meta_description']);
const proposedByWebMCP = new Set();
const statusCheckedByWebMCP = new Set();
let registered;

function fail(code, message) { return Object.assign(new Error(message), { code }); }
function obj(value, name = 'input') { if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('invalid_input', `${name} must be an object`); return value; }
function keys(value, allowed) { for (const key of Object.keys(value)) if (!allowed.has(key)) throw fail(['approve', 'apply', 'rollback', 'publish', 'shopify', 'policy', 'rbac', 'action'].includes(key) ? 'forbidden_action' : 'invalid_input', `Unsupported field: ${key}`); }
function identifier(value, name) { if (typeof value !== 'string' || !ID.test(value)) throw fail('invalid_input', `Invalid ${name}`); return value; }
function activity(name, detail = {}) { if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('commercegov:webmcp-activity', { detail: { name, ...detail } })); }

function searchInput(input = {}) {
  const value = obj(input); keys(value, new Set(['query', 'limit']));
  if (value.query !== undefined && typeof value.query !== 'string') throw fail('invalid_input', 'query must be a string');
  if (value.limit !== undefined && (!Number.isInteger(value.limit) || value.limit < 1 || value.limit > 100)) throw fail('invalid_input', 'limit must be an integer between 1 and 100');
  return { query: value.query ?? '', limit: value.limit ?? 10 };
}
function productInput(input) { const value = obj(input); keys(value, new Set(['product_id'])); return identifier(value.product_id, 'product_id'); }
function proposalInput(input) {
  const value = obj(input); keys(value, new Set(['product_id', 'changes', 'idempotency_key']));
  const changes = obj(value.changes, 'changes'); keys(changes, FIELDS);
  if (!Object.keys(changes).length) throw fail('invalid_input', 'changes must contain a controlled field');
  for (const [field, proposed] of Object.entries(changes)) if (typeof proposed !== 'string') throw fail('invalid_input', `${field} must be a string`);
  if (typeof value.idempotency_key !== 'string' || value.idempotency_key.length < 8 || value.idempotency_key.length > 128 || !KEY.test(value.idempotency_key)) throw fail('invalid_input', 'Invalid idempotency_key');
  return { product_id: identifier(value.product_id, 'product_id'), changes, idempotency_key: value.idempotency_key };
}
function proposalIdInput(input) { const value = obj(input); keys(value, new Set(['proposal_id'])); return identifier(value.proposal_id, 'proposal_id'); }

const SAFE_ERROR_MESSAGES = Object.freeze({
  invalid_input: 'The request input is invalid.',
  forbidden_action: 'The requested action is not permitted.',
  not_found: 'The requested governed resource was not found.',
  binding_mismatch: 'The request does not match the configured authority scope.',
  backend_unavailable: 'CommerceGov backend request failed.',
  invalid_backend_response: 'CommerceGov returned an invalid response.',
  cancelled: 'The request was cancelled.',
  idempotency_conflict: 'The idempotency key was already used for a different proposal request.'
});

function safeErrorCode(code, status) {
  if (Object.hasOwn(SAFE_ERROR_MESSAGES, code)) return code;
  return { 400: 'invalid_input', 403: 'forbidden_action', 404: 'not_found', 409: 'idempotency_conflict', 422: 'invalid_input', 502: 'invalid_backend_response', 503: 'backend_unavailable' }[status] || 'backend_unavailable';
}

async function request(url, options = {}) {
  try {
    const response = await fetch(url, options); let data;
    try { data = await response.json(); } catch { throw fail('invalid_backend_response', 'Backend returned invalid JSON'); }
    if (response.ok) return data;
    const code = safeErrorCode(data?.code, response.status);
    throw fail(code, SAFE_ERROR_MESSAGES[code]);
  } catch (error) {
    if (error?.name === 'AbortError' || options.signal?.aborted) throw fail('cancelled', 'Request cancelled');
    throw error;
  }
}
const get = (url, signal) => request(url, { signal });
const post = (url, body, signal) => request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });

export const toolDescriptors = [
  { name: 'search_products', title: 'Search governed products', description: 'Find a product by title or decimal product ID before governance inspection; read-only.', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Optional case-insensitive product title or ID fragment.' }, limit: { type: 'integer', description: 'Maximum results.', minimum: 1, maximum: 100, default: 10 } }, required: [], additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: async (input = {}, options = {}) => { const v = searchInput(input); const out = await get(`/api/products?query=${encodeURIComponent(v.query)}&limit=${v.limit}`, options.signal); activity('Product discovered', { tool: 'search_products' }); return out; } },
  { name: 'get_governance_context', title: 'Inspect product governance', description: 'Read current controlled content, policy, and bounded agent/human authority.', inputSchema: { type: 'object', properties: { product_id: { type: 'string', description: 'Positive decimal governed product ID.', pattern: '^[1-9]\\d{0,19}$' } }, required: ['product_id'], additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: async (input, options = {}) => { const id = productInput(input); const out = await get(`/api/products/${encodeURIComponent(id)}/context`, options.signal); activity('Governance inspected', { tool: 'get_governance_context' }); return out; } },
  { name: 'propose_change', title: 'Propose governed product changes', description: 'Create or replay a CommerceGov Review proposal only. It cannot approve, apply, publish, or write Shopify production.', inputSchema: { type: 'object', properties: { product_id: { type: 'string', pattern: '^[1-9]\\d{0,19}$', description: 'Positive decimal governed product ID.' }, changes: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, meta_title: { type: 'string' }, meta_description: { type: 'string' } }, minProperties: 1, additionalProperties: false }, idempotency_key: { type: 'string', description: 'Stable key for replaying the same proposal safely.', minLength: 8, maxLength: 128, pattern: '^[^\\u0000-\\u0020\\u007F]+$' } }, required: ['product_id', 'changes', 'idempotency_key'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, execute: async (input, options = {}) => { const v = proposalInput(input); const out = await post(`/api/products/${encodeURIComponent(v.product_id)}/proposals`, { changes: v.changes, idempotency_key: v.idempotency_key }, options.signal); proposedByWebMCP.add(String(out.proposal_id)); activity('Change proposed', { tool: 'propose_change', proposal_id: out.proposal_id }); return out; } },
  { name: 'get_change_status', title: 'Check governed proposal status', description: 'Observe the lifecycle after proposal creation; read-only.', inputSchema: { type: 'object', properties: { proposal_id: { type: 'string', description: 'Positive decimal CommerceGov proposal ID.', pattern: '^[1-9]\\d{0,19}$' } }, required: ['proposal_id'], additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: async (input, options = {}) => { const id = proposalIdInput(input); const out = await get(`/api/proposals/${encodeURIComponent(id)}`, options.signal); statusCheckedByWebMCP.add(id); activity('Status checked', { tool: 'get_change_status' }); return out; } },
  { name: 'get_audit_evidence', title: 'Read proposal audit evidence', description: 'Return bounded, safe lifecycle evidence for a governed proposal; read-only.', inputSchema: { type: 'object', properties: { proposal_id: { type: 'string', description: 'Positive decimal CommerceGov proposal ID.', pattern: '^[1-9]\\d{0,19}$' } }, required: ['proposal_id'], additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: async (input, options = {}) => { const id = proposalIdInput(input); const out = await get(`/api/proposals/${encodeURIComponent(id)}/audit`, options.signal); activity('Audit evidence read', { tool: 'get_audit_evidence' }); if (proposedByWebMCP.has(id) && statusCheckedByWebMCP.has(id)) activity('Waiting for human review', { tool: 'get_audit_evidence', proposal_id: id }); return out; } }
];

export async function registerWebMCPTools({ lifecycleSignal } = {}) {
  if (registered) return registered;
  if (typeof document === 'undefined' || typeof document.modelContext?.registerTool !== 'function') return false;
  const attemptController = new AbortController();
  const abortAttempt = () => {
    attemptController.abort(lifecycleSignal?.reason);
    registered = null;
    document.dispatchEvent(new CustomEvent('commercegov:webmcp-status', { detail: { ready: false } }));
  };
  if (lifecycleSignal?.aborted) abortAttempt();
  else lifecycleSignal?.addEventListener('abort', abortAttempt, { once: true });
  registered = (async () => {
    try {
      for (const tool of toolDescriptors) await document.modelContext.registerTool(tool, { signal: attemptController.signal });
      document.dispatchEvent(new CustomEvent('commercegov:webmcp-status', { detail: { ready: true } })); return true;
    } catch {
      attemptController.abort();
      lifecycleSignal?.removeEventListener('abort', abortAttempt);
      registered = null;
      document.dispatchEvent(new CustomEvent('commercegov:webmcp-status', { detail: { ready: false } }));
      return false;
    }
  })();
  return registered;
}
export const intendedPublicTools = toolDescriptors.map(({ name }) => name);
