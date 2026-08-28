import { createMockCommerceGov } from './mock.js';

// Boundary: replace this implementation with the future CommerceGov Integration API.
// Browser/WebMCP code must not need to change when that occurs.
export function createCommerceGovClient() {
  return createMockCommerceGov();
}
