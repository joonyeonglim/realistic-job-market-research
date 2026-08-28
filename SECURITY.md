# Security Policy

Report vulnerabilities privately through GitHub Security Advisories. Do not open a public issue containing credentials, private profile data, internal-network targets, or exploitable request details.

Supported security scope is the latest tagged release. The collectors must not access private, loopback, link-local, metadata-service, authenticated, paywalled, or CAPTCHA-protected surfaces without an explicitly reviewed path.

The skill runs with the invoking agent's permissions. Review the repository and pin a release before installation in a sensitive environment.

The optional bootstrap installers write only to the user cache. Node archives are checked against Node.js `SHASUMS256.txt`; Python fallback uses the pinned official uv installer and a uv-managed Python. Set `RJMR_RUNTIME_DIR` or `XDG_CACHE_HOME` to isolate or discard those runtimes.
