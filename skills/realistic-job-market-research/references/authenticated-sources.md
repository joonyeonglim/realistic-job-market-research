# Authenticated and Personalized Sources

Public collectors never open a browser, reuse cookies, or bypass access controls.

Jobplanet, RocketPunch, and Remember have `access_mode: main_chrome` because their public HTTP route is challenge-protected or personalized. For each:

1. Read the expected browser profile from the local private profile.
2. Confirm the visible profile before navigating. If window targeting returns another profile, stop before navigation.
3. Use the current runtime's authorized browser route. When Aside is available, delegate browser interaction to its agent, verify the owned session and actual workspace, then reuse that session/tab. The browser agent handles normal sign-in and protected saved-password entry; ask the owner only for missing credentials, OS approval, OTP or CAPTCHA. Never record credentials, cookies, recruiter names, phone numbers, or email addresses. Do not silently switch browser tools when a route is blocked.
4. Collect only the declared searches or inbound states in read-only mode.
5. Write `imports/<source>.json` using `assets/browser-export.example.json`, then let `collect-extended-sources.mjs` validate domains, fields, hashes, and convert it to canonical `raw/<source>.json`.
6. If the export is absent or the surface cannot be safely read, keep the zero-row `blocked` snapshot with the exact reason in that run and retry in a new run.

Inbound proposals may be reviewed before new search because they can have higher practical value. Record only employer, role, status, current detail URL when safe, and evidence time. Do not accept, reject, save, message, or edit a profile without explicit authorization for that exact action.
