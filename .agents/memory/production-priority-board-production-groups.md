---
name: Production Priority Board production-group mapping
description: How to derive the operator-facing Production Group from the D365FO machine Resource value.
---

Derive Production Group from the group portion of the machine source row's `Resource` text: normally the third slash-delimited segment, but combine the `W` and `H-*` segments when warehouse paths split the prefix.

The pop-out's expanded label comes from `costproductiongroupstaging.groupname`, joined by trimmed production group ID and company. Keep this separate from the short code used in the main grid.

**Why:** The machine Resource path carries the short operational code, while D365FO's production-group master carries the requested descriptive label. For example, `Assy07` resolves to `Assy07-COHEN, KYLE G-1117`.

**How to apply:** Split Resource on `/` and trim the segments. For `W/H-End`, `W/H-Start`, or `W/H-Hold`, combine segments 1 and 2 with `/`; otherwise use segment 2. Resolve the full label through a deduplicated, set-based staging lookup and fall back to the short code when no match exists.