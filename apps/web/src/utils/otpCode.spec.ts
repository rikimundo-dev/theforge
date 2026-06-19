import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCompleteOtpCode, normalizeOtpCode } from "./otpCode.js";

describe("normalizeOtpCode", () => {
  it("keeps plain six digits", () => {
    assert.equal(normalizeOtpCode("123456"), "123456");
  });

  it("strips spaces and dashes from pasted codes", () => {
    assert.equal(normalizeOtpCode("123 456"), "123456");
    assert.equal(normalizeOtpCode("123-456"), "123456");
    assert.equal(normalizeOtpCode(" 12 3-45 6 "), "123456");
  });

  it("truncates to six digits", () => {
    assert.equal(normalizeOtpCode("1234567890"), "123456");
  });

  it("detects complete codes after normalization", () => {
    assert.equal(isCompleteOtpCode("123 456"), true);
    assert.equal(isCompleteOtpCode("12345"), false);
  });
});
