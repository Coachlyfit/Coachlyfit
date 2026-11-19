import { describe, expect, it } from "vitest";
import { clientIp } from "./client-ip";

describe("clientIp", () => {
  it("takes the first hop", () => {
    expect(clientIp("203.0.113.9, 10.0.0.1")).toBe("203.0.113.9");
    expect(clientIp("2001:db8::1")).toBe("2001:db8::1");
  });

  it("rejects missing or malformed values", () => {
    for (const bad of [null, "", "unknown", "999.1.1.1", "1.2.3", "1.2.3.4; drop table", "'; --"]) {
      expect(clientIp(bad), String(bad)).toBeNull();
    }
  });
});
