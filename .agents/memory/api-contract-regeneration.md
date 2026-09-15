---
name: API contract regeneration
description: Regenerate and rebuild the shared API client after changing the production-priority OpenAPI response.
---

After a production-priority OpenAPI contract change, run the API-spec code generation before typechecking a consuming artifact. The Board resolves the built shared API client types, so its typecheck can otherwise see an older response shape even when generated source files look current.

**Why:** A response expansion can leave the Board, its test fixtures, and the API client out of agreement until the generated client is rebuilt.

**How to apply:** Run `pnpm --filter @workspace/api-spec run codegen`, update typed fixtures for the changed contract, then typecheck the affected artifact.
