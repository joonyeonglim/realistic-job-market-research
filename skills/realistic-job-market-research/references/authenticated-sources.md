# Authenticated and Personalized Sources

Public collectors never open a browser, reuse cookies, or bypass access controls.

When a source plan entry has `access_mode: main_chrome`:

1. Read the expected browser profile from the local private profile.
2. Confirm the visible profile before navigating. If window targeting returns another profile, stop before navigation.
3. Let the owner handle login. Never record credentials, cookies, recruiter names, phone numbers, or email addresses.
4. Collect only the declared searches or inbound states in read-only mode.
5. Write one canonical `raw/<source>.json` snapshot using [raw-schema.md](raw-schema.md).
6. If the surface cannot be safely read, write a zero-row `blocked` snapshot with the exact reason.

Inbound proposals may be reviewed before new search because they can have higher practical value. Record only employer, role, status, current detail URL when safe, and evidence time. Do not accept, reject, save, message, or edit a profile without explicit authorization for that exact action.
