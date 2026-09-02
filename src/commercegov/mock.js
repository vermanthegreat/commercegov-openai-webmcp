import { CommerceGovContractError, assertBinding, assertProposeOnlyPayload, authorityProjection } from './contracts.js';

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

  function idempotencyIdentity(productId, changes) {
    const normalizedChanges = Object.fromEntries(Object.entries(changes).sort(([left], [right]) => left.localeCompare(right)));
    return JSON.stringify({ agency, shop, product_id: productId, changes: normalizedChanges });
  }

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
        ...authorityProjection(binding),
        authority: { agent: ['read', 'analyze', 'propose'], approve: 'human_required', apply: 'human_required' }
      };
    },

    async proposeChange(productId, payload = {}) {
      assertBinding(binding, payload);
      const { changes, idempotency_key: idempotencyKey } = assertProposeOnlyPayload(payload);
      if (!findProduct(productId)) throw new CommerceGovContractError('product_not_found', 'Product not found', { status: 404 });
      const scopedKey = `${agency}\u0000${shop}\u0000${idempotencyKey}`;
      const requestIdentity = idempotencyIdentity(productId, changes);
      if (idempotencyKeys.has(scopedKey)) {
        const replay = idempotencyKeys.get(scopedKey);
        if (replay.request_identity !== requestIdentity) {
          throw new CommerceGovContractError('idempotency_conflict', 'Idempotency key was already used for a different proposal request', { status: 409 });
        }
        return { created: true, proposal_id: replay.proposal_id, product_id: replay.product_id, stage: 'review', review_state: 'Review/pending', policy_result: replay.policy_result, idempotent_replay: true, next_required_authority: 'human_review', production_changed: false };
      }
      const storedProposal = {
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
        next_required_authority: 'human_review',
        production_changed: false,
        idempotent_replay: false
      };
      storedProposal.request_identity = requestIdentity;
      proposals.set(storedProposal.proposal_id, storedProposal);
      idempotencyKeys.set(scopedKey, storedProposal);
      return {
        created: true,
        proposal_id: storedProposal.proposal_id,
        product_id: storedProposal.product_id,
        stage: 'review',
        review_state: 'Review/pending',
        policy_result: storedProposal.policy_result,
        idempotent_replay: false,
        next_required_authority: 'human_review',
        production_changed: false
      };
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
