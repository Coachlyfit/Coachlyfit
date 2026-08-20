import { describe, expect, it } from "vitest";
import { adherenceFromDb, adherenceToDb } from "./checkin-wizard";

describe("adherenceToDb", () => {
  it("scales a 1-10 tap value up to the DB's 0-100 range", () => {
    expect(adherenceToDb(7)).toBe(70);
  });

  it("handles the scale's extremes", () => {
    expect(adherenceToDb(1)).toBe(10);
    expect(adherenceToDb(10)).toBe(100);
  });
});

describe("adherenceFromDb", () => {
  it("scales a DB value back down to the 1-10 tap range", () => {
    expect(adherenceFromDb(70)).toBe(7);
  });

  it("round-trips with adherenceToDb across the whole scale", () => {
    for (let v = 1; v <= 10; v++) {
      expect(adherenceFromDb(adherenceToDb(v))).toBe(v);
    }
  });
});
