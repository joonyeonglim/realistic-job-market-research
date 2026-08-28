#!/usr/bin/env node
import assert from "node:assert/strict";
import { isBlockedAddress, validatePublicUrl } from "./safe-http.mjs";

for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "::1", "fd00::1", "fe80::1", "2001:db8::1"]) assert.equal(isBlockedAddress(address), true);
for (const address of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"]) assert.equal(isBlockedAddress(address), false);
assert.throws(() => validatePublicUrl("file:///etc/passwd"), /protocol/);
assert.throws(() => validatePublicUrl("http://169.254.169.254/latest/meta-data"), /forbidden/);
assert.throws(() => validatePublicUrl("https://user:pass@example.com"), /credentials/);
assert.equal(validatePublicUrl("https://example.com/jobs").hostname, "example.com");
console.log("SAFE_HTTP_SELF_TEST_PASS");
