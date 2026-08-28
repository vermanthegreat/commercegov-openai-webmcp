import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockCommerceGov } from '../src/commercegov/mock.js';

test('mock provides the one governed product and a review-only proposal', () => {
  const mock = createMockCommerceGov();
  const { products } = mock.searchProducts();
  assert.deepEqual(products, [{ product_id: '7638071377991', title: 'The Snowboard', stage: 'active' }]);
  const context = mock.getGovernanceContext('7638071377991');
  assert.equal(context.authority.approve, 'human_required');
  const proposal = mock.createProposal('7638071377991', { changes: { title: 'Improved Snowboard Title' } });
  assert.equal(proposal.stage, 'review');
  assert.deepEqual(mock.getProposalStatus(proposal.proposal_id), { proposal_id: proposal.proposal_id, state: 'review' });
  assert.deepEqual(mock.getAuditEvidence(proposal.proposal_id).events, [{ event: 'proposal_created', state: 'created' }]);
});
