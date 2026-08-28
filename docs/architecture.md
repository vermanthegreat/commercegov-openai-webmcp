# Architecture

```text
ChatGPT in-app browser
        |
        | WebMCP
        v
CommerceGov WebMCP page
        |
        | local browser/BFF API
        v
CommerceGov client boundary
        |
        | future Integration API
        v
CommerceGov
        |
        +-- Policy
        +-- Review
        +-- Approval
        +-- Apply
        +-- Verification
        |
        v
Shopify
```

WebMCP write != Shopify write

WebMCP write = create governed proposal

The agent may read, analyze, propose, and observe. CommerceGov retains review, approval, apply, and verification authority. The local routes in this initial skeleton are not a claim about production API design.
