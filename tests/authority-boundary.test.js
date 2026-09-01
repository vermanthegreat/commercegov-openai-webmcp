import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AUTHORITY_INVARIANTS, COMMERCEGOV_CLIENT_METHODS, FORBIDDEN_TOOL_TERMS, PUBLIC_WEBMCP_TOOLS, assertCommerceGovClient } from '../src/commercegov/contracts.js';
import { createMockCommerceGov } from '../src/commercegov/mock.js';

test('public WebMCP surface has exactly the five bounded tools', () => {
  assert.deepEqual(PUBLIC_WEBMCP_TOOLS, [
    'search_products', 'get_governance_context', 'propose_change', 'get_change_status', 'get_audit_evidence'
  ]);
});

test('mock conforms to the normalized five-method adapter contract', () => {
  const mock = assertCommerceGovClient(createMockCommerceGov());
  assert.deepEqual(COMMERCEGOV_CLIENT_METHODS, [
    'searchProducts', 'getGovernanceContext', 'proposeChange', 'getChangeStatus', 'getAuditEvidence'
  ]);
  assert.equal('createProposal' in mock, false);
  assert.equal('getProposalStatus' in mock, false);
});

test('browser-facing code contains no CommerceGov or Shopify credential names', async () => {
  const browser = `${await readFile(new URL('../src/public/app.js', import.meta.url), 'utf8')}\n${await readFile(new URL('../src/public/webmcp.js', import.meta.url), 'utf8')}`;
  assert.doesNotMatch(browser, /COMMERCEGOV_API_TOKEN|SHOPIFY_(?:ACCESS_)?TOKEN|Authorization\s*:/i);
});

test('generic proposal payload cannot smuggle privileged actions', async () => {
  const mock = createMockCommerceGov();
  for (const action of ['approve', 'apply', 'rollback', 'shopify_write']) {
    await assert.rejects(
      mock.proposeChange('7638071377991', { action, changes: { title: 'Safe title' }, idempotency_key: `key-${action}-001` }),
      (error) => error.code === 'forbidden_action'
    );
    await assert.rejects(
      mock.proposeChange('7638071377991', { changes: { action }, idempotency_key: `key-nested-${action}` }),
      (error) => error.code === 'forbidden_action'
    );
  }
});

test('mock fails closed on cross-tenant and wrong-shop assertions', async () => {
  const mock = createMockCommerceGov({ agency: 'agency-a', shop: 'a.myshopify.com' });
  await assert.rejects(mock.searchProducts({ agency: 'agency-b' }), (error) => error.code === 'binding_mismatch');
  await assert.rejects(mock.getGovernanceContext('7638071377991', { shop: 'b.myshopify.com' }), (error) => error.code === 'binding_mismatch');
});

test('forbidden mutation authority is absent', () => {
  for (const term of FORBIDDEN_TOOL_TERMS) {
    assert.equal(PUBLIC_WEBMCP_TOOLS.some((tool) => tool.includes(term)), false, `${term} must not be public`);
  }
  for (const key of ['WEBMCP_MAY_APPROVE', 'WEBMCP_MAY_APPLY', 'WEBMCP_MAY_ROLLBACK', 'WEBMCP_MAY_CHANGE_POLICY', 'WEBMCP_MAY_CHANGE_RBAC', 'WEBMCP_MAY_WRITE_SHOPIFY']) {
    assert.equal(AUTHORITY_INVARIANTS[key], false);
  }
});
