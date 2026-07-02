# Architecture Decision Records (ADR)

Architecture Decision Records capture important architecture decisions, their context, tradeoffs, and implementation guidance for future agents and maintainers.

## Conventions

- Directory: `docs/decisions/`
- Naming: numbered files, `NNNN-short-title.md`
- Status values: `proposed`, `accepted`, `rejected`, `deprecated`, `superseded`

## Workflow

- Create a new ADR as `proposed`.
- Discuss and iterate.
- Mark it `accepted` when the decision is approved.
- Create a new ADR and mark the old one `superseded` when a later decision replaces it.

## ADRs

- [ADR-0001: Define Skillpack as a Skill-Centric Management Platform](0001-skillpack-north-star.md) — superseded by ADR-0008 and ADR-0009 for storage/versioning implementation details
- [ADR-0002: Separate Skill Origin Adapters from Managed Skill Lifecycle](0002-origin-adapters.md) — proposed
- [ADR-0003: Adopt a Turborepo Monorepo Layout](0003-turborepo-monorepo-layout.md) — accepted
- [ADR-0004: Make Skillpack an OAuth Provider for Skill Access](0004-skillpack-oauth-provider.md) — proposed
- [ADR-0005: Use OAuth App Credentials for Public GitHub Origin Reads](0005-public-github-origin-reads.md) — proposed
- [ADR-0006: Use TanStack Router File-Based Routing for the SPA](0006-tanstack-router-file-based-routing.md) — accepted
- [ADR-0007: Expose Skillpack Skill Delivery over MCP](0007-skillpack-mcp-delivery-endpoint.md) — accepted
- [ADR-0008: Restructure Skill Storage as a Content-Addressed Version DAG](0008-skill-storage-version-dag.md) — proposed
- [ADR-0009: Inline Skill Version Snapshots with First-Class SKILL.md Pointers](0009-inline-skill-version-snapshots.md) — accepted
