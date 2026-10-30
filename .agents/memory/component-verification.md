---
name: Component catalog verification
description: Avoid mistaking headless-DOM environment limits for regressions in source-backed UI components.
---

Headless DOM render checks do not establish layout fidelity for observer-driven components, and browser constructors must come from one DOM realm rather than mixing Node and browser globals.

**Why:** The extracted catalog's checks initially failed on missing observer APIs and incompatible AbortSignal realms, not differences in the ported components. Charts also report zero dimensions in a DOM environment without layout.

**How to apply:** Use source-reference comparisons and the project's configured test environment for behavior checks. Review real browser screenshots for charts, carousels and bounded layouts. Do not change production components to accommodate limitations of a temporary test harness.
