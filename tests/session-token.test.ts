import { describe, expect, it } from "vitest";
import {
  decodeSessionToken,
  encodeSessionToken,
} from "@/lib/providers/session-token";

describe("session token helpers", () => {
  const secret = "test-secret";

  it("round-trips a signed payload", () => {
    const token = encodeSessionToken(
      {
        sub: "admin",
        sid: "session-1",
        exp: Date.now() + 60_000,
      },
      secret
    );

    const payload = decodeSessionToken(token, secret);

    expect(payload).toMatchObject({
      sub: "admin",
      sid: "session-1",
    });
  });

  it("rejects tampered signatures", () => {
    const token = encodeSessionToken(
      {
        sub: "admin",
        sid: "session-1",
        exp: Date.now() + 60_000,
      },
      secret
    );

    const tampered = `${token}broken`;

    expect(decodeSessionToken(tampered, secret)).toBeNull();
  });

  it("rejects malformed payloads", () => {
    expect(decodeSessionToken("bad-token", secret)).toBeNull();
  });

  it("rejects tokens with extra segments", () => {
    const token = encodeSessionToken(
      {
        sub: "admin",
        sid: "session-1",
        exp: Date.now() + 60_000,
      },
      secret
    );

    expect(decodeSessionToken(`${token}.ignored`, secret)).toBeNull();
  });
});
