import { CommerceGovContractError, assertBinding, assertProposeOnlyPayload } from './contracts.js';

const PRODUCT = Object.freeze({
  product_id: '7638071377991',
  title: 'The Snowboard',
  stage: 'active'
});

export function createMockCommerceGov({ agency = 'demo-agency', shop = 'demo.myshopify.com' } = {}) {
  const proposals = new Map();
  const idempotencyKeys = new Map();
  let nextProposalId = 1;
  const binding = Object.freeze({ agency, shop });

  function findProduct(productId) {
    return productId === PRODUCT.product_id ? PRODUCT : null;
  }

  return {
    async searchProducts({ query = '', limit = 10, ...requestedBinding } = {}) {
      assertBinding(binding, requestedBinding);
      const matches = PRODUCT.title.toLowerCase().includes(String(query).toLowerCase());
      return { products: matches ? [PRODUCT].slice(0, Number(limit) || 10) : [] };
    },

    async getGovernanceContext(productId, requestedBinding = {}) {
      assertBinding(binding, requestedBinding);
      const product = findProduct(productId);
      if (!product) throw new CommerceGovContractError('product_not_found', 'Product not found', { status: 404 });
      return {
        product_id: product.product_id,
        current: { title: product.title, description: '', meta_title: '', meta_description: '' },
        stage: product.stage,
        policy: {
          schema_version: 'commercegov.integration.policy.v1',
          effective_policy_hash: '0'.repeat(64),
          controlled_fields: ['title', 'description', 'meta_title', 'meta_description'],
          brand_tone: 'clear',
          forbidden_terms: [],
          max_length: { title: 70, description: 5000, meta_title: 70, meta_description: 320 },
          seo_constraints: { keyword_coverage: 'recommended' },
          proposal_instructions: 'Submit for human review.'
        },
        authority: {
          agent: ['read', 'analyze', 'propose'],
          approve: 'human_required',
          apply: 'human_required'
        }
      };
    },

    async proposeChange(productId, payload = {}) {
      assertBinding(binding, payload);
      const { changes, idempotency_key: idempotencyKey } = assertProposeOnlyPayload(payload);
      if (!findProduct(productId)) throw new CommerceGovContractError('product_not_found', 'Product not found', { status: 404 });
      if (idempotencyKey && idempotencyKeys.has(idempotencyKey)) {
        return idempotencyKeys.get(idempotencyKey);
      }
      const proposal = {
        proposal_id: String(nextProposalId++),
        stage: 'review',
        review_state: 'Review/pending',
        policy_result: { status: 'pass', violations: [] },
        changes,
        product_id: productId,
        status: 'review',
        agency,
        shop,
        target: { type: 'product', product_id: productId },
        mutation_class: 'product_content_proposal',
        proposed_value: changes,
        next_required_authority: 'human_review'
      };
      proposals.set(proposal.proposal_id, proposal);
      if (idempotencyKey) idempotencyKeys.set(idempotencyKey, proposal);
      return proposal;
    },

    async getChangeStatus(proposalId, requestedBinding = {}) {
      assertBinding(binding, requestedBinding);
      const proposal = proposals.get(proposalId);
      if (!proposal) throw new CommerceGovContractError('proposal_not_found', 'Proposal not found', { status: 404 });
      return { proposal_id: proposal.proposal_id, state: proposal.stage };
    },

    async getAuditEvidence(proposalId, requestedBinding = {}) {
      assertBinding(binding, requestedBinding);
      const proposal = proposals.get(proposalId);
      if (!proposal) throw new CommerceGovContractError('proposal_not_found', 'Proposal not found', { status: 404 });
      return {
        proposal_id: proposal.proposal_id,
        events: [{ event: 'proposal_created', state: 'created', at: '2026-01-01T00:00:00Z' }],
        truncated: false,
        complete: false,
        returned_count: 1
      };
    }
  };
}
