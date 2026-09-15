# Planner Vida Safe Fixture Policy

Status: Milestone 02 operational policy  
Scope: Synthetic fixtures for local, CI, preview/test, and future E2E validation

## Policy

Planner Vida local, CI, and preview/test validation must use synthetic data only. Production financial records, production exports, AFR production snapshots, real PDFs, real account numbers, real card data, service keys, user credentials, and raw personally identifiable financial details are not valid test fixtures.

## Synthetic Fixture Requirements

Future fixture sets must include:

- at least two users to validate ownership boundaries and isolation;
- accounts with non-sensitive names and artificial balances;
- categories, transactions, transfers, installments, invoices, commitments, and planning entities only when the milestone implementing that domain requires them;
- deterministic dates and monetary values that make reconciliations repeatable;
- no real bank names tied to real account numbers;
- no production Supabase project IDs, URLs, service keys, or storage paths;
- no raw AFR production exports.

## Approved Sources

| Source                                              |             Allowed | Notes                                                           |
| --------------------------------------------------- | ------------------: | --------------------------------------------------------------- |
| Hand-authored synthetic JSON/CSV/SQL fixtures       |                 Yes | Must be deterministic and reviewable                            |
| Generated synthetic data from deterministic scripts |                 Yes | Generation code and seed must be committed                      |
| Masked/minimized production-like data               | Not in Milestone 02 | Requires explicit future approval and data-handling record      |
| Raw production data                                 |                  No | Never for local, CI, or preview/test                            |
| Legacy AFR code behavior references                 |                 Yes | Behavior reference only; not raw credentials or production data |

## Fixture Storage

Milestone 02 does not create data fixtures because no schema or product flows exist yet. When future milestones require fixtures, store them in a clearly named test fixture directory owned by the implementing milestone, keep them deterministic, and document the fixture purpose in the same commit.

## CI and E2E

CI must not depend on production data or production secrets. E2E execution is reserved for later milestones once app flows exist, but E2E typechecking remains part of the regression gate.

## Review Checklist

Before adding or changing fixtures, confirm:

- data is synthetic;
- at least two-user isolation is covered where ownership matters;
- totals are deterministic and audit-friendly;
- no secrets or production identifiers are committed;
- fixture scope belongs to the current milestone.
