# Source Governance

[`assets/source-governance.json`](../assets/source-governance.json) is the machine-readable control surface. It is not a legal opinion or a grant of permission.

Before live collection:

1. Review the current source terms, robots policy, documented API or public-access conditions, permitted purpose, retention, and redistribution boundary.
2. Keep raw bodies in the private ignored run directory. Do not publish them under this repository's MIT license.
3. Prefer documented APIs and official feeds. Do not bypass login, CAPTCHA, paywalls, or other access controls.
4. Use the identified crawler user agent, bounded response size, public-network-only URL validation, host throttling, and `Retry-After` handling.
5. Pass `--acknowledge-source-policy` only after accepting that every source currently remains `review_required`.

`implemented` means a parser exists. It does not mean the source has granted permission. `probe_only` means the tool records one access result and never claims collection. `authenticated_handoff` requires an owner-controlled browser and explicit action-time authorization.

If source terms are unclear or prohibit automation, set the source to blocked and do not collect it. Record the review date and safe alternative before changing `rights_status` in a future policy version.
