import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommerceGovApi, CommerceGovApiError } from '../src/commercegov/api.js';
import { createCommerceGovClient } from '../src/commercegov/client.js';

const binding = { agency: 'agency-a', shop: 'demo.myshopify.com' };

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function fixtureFetch(calls) {
  return async (url, options) => {
    calls.push({ url: String(url), options });
    const path = new URL(url).pathname;
    if (path.endsWith('/products')) {
      return jsonResponse({ shop_id: binding.shop, products: [{ product_id: '42', title: 'Red Board', stage: 'active', updated_at: '2026-01-01T00:00:00Z' }], limit: 100, offset: 0, has_more: false });
    }
    if (path.endsWith('/products/42/content')) {
      return jsonResponse({ shop_id: binding.shop, product_id: '42', stage: 'active', content: { title: 'Red Board', description: '', meta_title: '', meta_description: '' } });
    }
    if (path.endsWith('/policy')) {
      return jsonResponse({ shop_id: binding.shop, schema_version: 'commercegov.integration.policy.v1', effective_policy_hash: 'a'.repeat(64), controlled_fields: ['title', 'description', 'meta_title', 'meta_description'], rules: { brand_tone: 'clear', forbidden_terms: [], max_length: { title: 70, description: 5000, meta_title: 70, meta_description: 320 }, seo_constraints: { keyword_coverage: 'recommended' }, proposal_instructions: 'Review.' } });
    }
    if (path.endsWith('/products/42/proposals')) {
      return jsonResponse({ shop_id: binding.shop, product_id: '42', proposal_id: '7', review_state: 'Review/pending', stage: 'review', policy_result: { status: 'pass', violations: [] }, changed_fields: ['title'], content: { title: 'Blue Board', description: '', meta_title: '', meta_description: '' } }, 201);
    }
    if (path.endsWith('/proposals/7/trace')) {
      return jsonResponse({ proposal_id: '7', events: [{ event: 'proposal_created', state: 'created', at: '2026-01-01T00:00:00Z' }], truncated: false, complete: false, returned_count: 1 });
    }
    if (path.endsWith('/proposals/7')) {
      return jsonResponse({ proposal_id: '7', review_state: 'review_pending', state: 'review_pending' });
    }
    return jsonResponse({ error: { code: 'not_found', message: 'Not found', retryable: false } }, 404);
  };
}

function createFixtureClient(calls = []) {
  return createCommerceGovApi({ baseUrl: 'https://commercegov.test', token: 'server-secret', ...binding, fetchImpl: fixtureFetch(calls) });
}

test('real client maps all five capabilities and keeps auth server-side', async () => {
  const calls = [];
  const client = createFixtureClient(calls);
  assert.deepEqual(await client.searchProducts({ query: 'red', limit: 1 }), { products: [{ product_id: '42', title: 'Red Board', stage: 'active' }] });
  const context = await client.getGovernanceContext('42');
  assert.equal(context.policy.effective_policy_hash, 'a'.repeat(64));
  assert.equal(context.authority.approve, 'human_required');
  const proposal = await client.proposeChange('42', { changes: { title: 'Blue Board' }, idempotency_key: 'proposal-001' });
  assert.equal(proposal.proposal_id, '7');
  assert.equal(proposal.next_required_authority, 'human_review');
  assert.equal(proposal.mutation_class, 'product_content_proposal');
  assert.deepEqual(await client.getChangeStatus('7'), { proposal_id: '7', state: 'review_pending' });
  assert.equal((await client.getAuditEvidence('7')).returned_count, 1);
  assert.ok(calls.every(({ options }) => options.headers.authorization === 'Bearer server-secret'));
  assert.equal(JSON.stringify({ context, proposal }).includes('server-secret'), false);
});

test('real client rejects tenant/shop mismatches and invalid targets before transport', async () => {
  const calls = [];
  const client = createFixtureClient(calls);
  await assert.rejects(client.searchProducts({ agency: 'agency-b' }), (error) => error.code === 'binding_mismatch');
  await assert.rejects(client.getGovernanceContext('42', { shop: 'wrong.myshopify.com' }), (error) => error.code === 'binding_mismatch');
  await assert.rejects(client.getGovernanceContext('../42'), (error) => error.code === 'invalid_product_id');
  await assert.rejects(client.getChangeStatus('0'), (error) => error.code === 'invalid_proposal_id');
  assert.equal(calls.length, 0);
});

test('real mode never falls back to mock when configuration is invalid', () => {
  assert.throws(
    () => createCommerceGovClient({ env: { COMMERCEGOV_MODE: 'real' } }),
    (error) => error instanceof CommerceGovApiError && error.code === 'configuration_error'
  );
  assert.throws(
    () => createCommerceGovClient({ env: {} }),
    (error) => error instanceof CommerceGovApiError && error.code === 'configuration_error'
  );
});

test('upstream errors are normalized without leaking transport secrets', async () => {
  const client = createCommerceGovApi({
    baseUrl: 'https://commercegov.test', token: 'never-leak-this', ...binding,
    fetchImpl: async () => { throw new Error('network failed with never-leak-this'); }
  });
  await assert.rejects(client.searchProducts(), (error) => {
    assert.equal(error.code, 'transport_error');
    assert.equal(error.retryable, true);
    assert.doesNotMatch(error.message, /never-leak-this/);
    return true;
  });
});
