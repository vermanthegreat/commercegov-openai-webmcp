export const AUTHORITY_INVARIANTS = Object.freeze({
  WEBMCP_MAY_SEARCH: true,
  WEBMCP_MAY_READ_CONTEXT: true,
  WEBMCP_MAY_PROPOSE: true,
  WEBMCP_MAY_READ_STATUS: true,
  WEBMCP_MAY_READ_AUDIT: true,
  WEBMCP_MAY_APPROVE: false,
  WEBMCP_MAY_APPLY: false,
  WEBMCP_MAY_ROLLBACK: false,
  WEBMCP_MAY_CHANGE_POLICY: false,
  WEBMCP_MAY_CHANGE_RBAC: false,
  WEBMCP_MAY_WRITE_SHOPIFY: false
});

export const PUBLIC_WEBMCP_TOOLS = Object.freeze([
  'search_products',
  'get_governance_context',
  'propose_change',
  'get_change_status',
  'get_audit_evidence'
]);

export const COMMERCEGOV_CLIENT_METHODS = Object.freeze([
  'searchProducts',
  'getGovernanceContext',
  'proposeChange',
  'getChangeStatus',
  'getAuditEvidence'
]);

export const CONTROLLED_PRODUCT_FIELDS = Object.freeze([
  'title', 'description', 'meta_title', 'meta_description'
]);

export const FORBIDDEN_TOOL_TERMS = Object.freeze([
  'approve', 'apply', 'rollback', 'publish', 'shopify_write', 'change_policy', 'change_role'
]);

export const WEBMCP_TOOL_COUNT = PUBLIC_WEBMCP_TOOLS.length;

const PUBLIC_ERROR_MESSAGES = Object.freeze({
  invalid_input: 'The request input is invalid.',
  forbidden_action: 'The requested action is not permitted.',
  not_found: 'The requested governed resource was not found.',
  binding_mismatch: 'The request does not match the configured authority scope.',
  backend_unavailable: 'CommerceGov backend request failed.',
  invalid_backend_response: 'CommerceGov returned an invalid response.',
  cancelled: 'The request was cancelled.',
  idempotency_conflict: 'The idempotency key was already used for a different proposal request.'
});

export function normalizePublicError(error = {}) {
  const rawCode = String(error.code || '');
  const status = Number.isInteger(error.status) ? error.status : 500;
  let code;
  if (rawCode === 'forbidden_action') code = 'forbidden_action';
  else if (rawCode === 'binding_mismatch') code = 'binding_mismatch';
  else if (rawCode === 'cancelled') code = 'cancelled';
  else if (rawCode === 'idempotency_conflict') code = 'idempotency_conflict';
  else if (rawCode === 'not_found' || rawCode.endsWith('_not_found') || status === 404) code = 'not_found';
  else if (rawCode === 'invalid_response' || rawCode === 'invalid_backend_response' || rawCode === 'authority_violation' || status === 502) code = 'invalid_backend_response';
  else if (rawCode === 'timeout' || rawCode === 'transport_error' || rawCode === 'backend_unavailable' || rawCode === 'configuration_error' || status >= 500) code = 'backend_unavailable';
  else code = 'invalid_input';
  return { code, message: PUBLIC_ERROR_MESSAGES[code] };
}

export function authorityProjection({ agency, shop }) {
  return {
    authority_scope: { agency_id: String(agency), shop: String(shop) },
    agent_authority: { search: true, inspect: true, propose: true, approve: false, apply: false, write_shopify: false },
    required_human_authority: { approve: 'human', apply: 'human' }
  };
}

export class CommerceGovContractError extends Error {
  constructor(code, message, { status = 422 } = {}) {
    super(message);
    this.name = 'CommerceGovContractError';
    this.code = code;
    this.status = status;
    this.retryable = false;
  }
}

export function assertCommerceGovClient(client) {
  for (const method of COMMERCEGOV_CLIENT_METHODS) {
    if (typeof client?.[method] !== 'function') {
      throw new CommerceGovContractError('invalid_client', `CommerceGov client is missing ${method}`);
    }
  }
  return client;
}

export function assertBinding(expected, requested = {}) {
  for (const field of ['agency', 'shop']) {
    if (requested[field] !== undefined && requested[field] !== expected[field]) {
      throw new CommerceGovContractError('binding_mismatch', `${field} binding does not match configured authority`);
    }
  }
  return expected;
}

export function assertProposeOnlyPayload(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new CommerceGovContractError('invalid_proposal', 'Proposal payload must be an object');
  }
  const allowedPayloadKeys = new Set(['changes', 'idempotency_key', 'agency', 'shop']);
  for (const key of Object.keys(payload)) {
    if (!allowedPayloadKeys.has(key)) {
      throw new CommerceGovContractError('forbidden_action', `Unsupported proposal field: ${key}`);
    }
  }
  const changes = payload.changes;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw new CommerceGovContractError('invalid_proposal', 'changes must be an object');
  }
  const allowedChanges = new Set(CONTROLLED_PRODUCT_FIELDS);
  for (const [key, value] of Object.entries(changes)) {
    if (!allowedChanges.has(key)) {
      throw new CommerceGovContractError('forbidden_action', `Unsupported controlled field: ${key}`);
    }
    if (typeof value !== 'string') {
      throw new CommerceGovContractError('invalid_proposal', `${key} must be a string`);
    }
  }
  if (Object.keys(changes).length === 0) {
    throw new CommerceGovContractError('invalid_proposal', 'At least one controlled field is required');
  }
  const idempotencyKey = String(payload.idempotency_key ?? '');
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128 || idempotencyKey !== idempotencyKey.trim() || /[\x00-\x20\x7f]/.test(idempotencyKey)) {
    throw new CommerceGovContractError('invalid_proposal', 'Invalid idempotency key');
  }
  return { changes: { ...changes }, idempotency_key: idempotencyKey };
}
