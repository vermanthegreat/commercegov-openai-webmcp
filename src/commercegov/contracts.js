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

export const FORBIDDEN_TOOL_TERMS = Object.freeze([
  'approve', 'apply', 'rollback', 'publish', 'shopify_write', 'change_policy', 'change_role'
]);
