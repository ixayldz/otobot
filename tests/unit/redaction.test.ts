import { describe, expect, test } from "vitest";
import { redactSecrets } from "../../src/core/security/redaction.js";

describe("redaction", () => {
  test("redacts secret-like values", () => {
    const input = "apiKey=abc123 token=xyz authorization: bearer secret sk-test-secret-value-123456 AIzaSyExampleKeyForUnitTestOnly123456";
    const out = redactSecrets(input);

    expect(out).not.toContain("abc123");
    expect(out).not.toContain("xyz");
    expect(out).not.toContain("secret");
    expect(out).not.toContain("sk-test-secret-value-123456");
    expect(out).not.toContain("AIzaSyExampleKeyForUnitTestOnly123456");
  });
});
