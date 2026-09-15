---
name: Admin Console role labels
description: Confirmed role-label convention used by the Admin Console for application access.
---

The Admin Console stores the application selection separately from the access level. For Production Priority Board, the exact access labels are `Read Only` and `Read / Write`; authorization must accept these bare labels rather than requiring the application name as a prefix.

**Why:** The Admin Console UI confirmed this convention, and requiring prefixed labels caused an authorized user to receive an access-denied response after successful Entra login.

**How to apply:** Map `Read Only` to viewer and `Read / Write` to editor. Keep matching exact after whitespace/case normalization, and continue denying unrelated or ambiguous labels.