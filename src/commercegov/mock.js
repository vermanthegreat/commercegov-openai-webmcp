const PRODUCT = Object.freeze({
  product_id: '7638071377991',
  title: 'The Snowboard',
  stage: 'active'
});

export function createMockCommerceGov() {
  const proposals = new Map();
  const idempotencyKeys = new Map();
  let nextProposalId = 1;

  function findProduct(productId) {
    return productId === PRODUCT.product_id ? PRODUCT : null;
  }

  return {
    searchProducts({ query = '', limit = 10 } = {}) {
      const matches = PRODUCT.title.toLowerCase().includes(String(query).toLowerCase());
      return { products: matches ? [PRODUCT].slice(0, Number(limit) || 10) : [] };
    },

    getGovernanceContext(productId) {
      const product = findProduct(productId);
      if (!product) return null;
      return {
        product_id: product.product_id,
        current: { title: product.title },
        stage: product.stage,
        policy: { max_title_length: 70 },
        authority: {
          agent: ['read', 'analyze', 'propose'],
          approve: 'human_required',
          apply: 'human_required'
        }
      };
    },

    createProposal(productId, { changes = {}, idempotency_key: idempotencyKey } = {}) {
      if (!findProduct(productId)) return null;
      if (idempotencyKey && idempotencyKeys.has(idempotencyKey)) {
        return idempotencyKeys.get(idempotencyKey);
      }
      const proposal = {
        proposal_id: String(nextProposalId++),
        stage: 'review',
        review_state: 'Review/pending',
        policy_result: { status: 'pass', violations: [] },
        changes,
        product_id: productId
      };
      proposals.set(proposal.proposal_id, proposal);
      if (idempotencyKey) idempotencyKeys.set(idempotencyKey, proposal);
      return proposal;
    },

    getProposalStatus(proposalId) {
      const proposal = proposals.get(proposalId);
      return proposal ? { proposal_id: proposal.proposal_id, state: proposal.stage } : null;
    },

    getAuditEvidence(proposalId) {
      const proposal = proposals.get(proposalId);
      return proposal ? {
        proposal_id: proposal.proposal_id,
        events: [{ event: 'proposal_created', state: 'created' }]
      } : null;
    }
  };
}
