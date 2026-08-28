import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTHORITY_INVARIANTS, FORBIDDEN_TOOL_TERMS, PUBLIC_WEBMCP_TOOLS } from '../src/commercegov/contracts.js';

test('public WebMCP surface has exactly the five bounded tools', () => {
  assert.deepEqual(PUBLIC_WEBMCP_TOOLS, [
    'search_products', 'get_governance_context', 'propose_change', 'get_change_status', 'get_audit_evidence'
  ]);
});

test('forbidden mutation authority is absent', () => {
  for (const term of FORBIDDEN_TOOL_TERMS) {
    assert.equal(PUBLIC_WEBMCP_TOOLS.some((tool) => tool.includes(term)), false, `${term} must not be public`);
  }
  for (const key of ['WEBMCP_MAY_APPROVE', 'WEBMCP_MAY_APPLY', 'WEBMCP_MAY_ROLLBACK', 'WEBMCP_MAY_CHANGE_POLICY', 'WEBMCP_MAY_CHANGE_RBAC', 'WEBMCP_MAY_WRITE_SHOPIFY']) {
    assert.equal(AUTHORITY_INVARIANTS[key], false);
  }
});
