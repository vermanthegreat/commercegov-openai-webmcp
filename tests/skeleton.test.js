import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockCommerceGov } from '../src/commercegov/mock.js';

test('mock provides the one governed product and a review-only proposal', async () => {
  const mock = createMockCommerceGov();
  const { products } = await mock.searchProducts();
  assert.deepEqual(products, [{ product_id: '7638071377991', title: 'The Snowboard', stage: 'active' }]);
  const context = await mock.getGovernanceContext('7638071377991');
  assert.equal(context.authority.approve, 'human_required');
  const proposal = await mock.proposeChange('7638071377991', { changes: { title: 'Improved Snowboard Title' }, idempotency_key: 'test-key-001' });
  assert.equal(proposal.stage, 'review');
  assert.deepEqual(await mock.getChangeStatus(proposal.proposal_id), { proposal_id: proposal.proposal_id, state: 'review' });
  assert.equal((await mock.getAuditEvidence(proposal.proposal_id)).events[0].event, 'proposal_created');
});
