import { describe, expect, it } from "vitest";
import { AvailabilityService } from "./availability.service";

const RULES = [{ id: "r1", weekday: 0, start_time: "09:00:00", end_time: "12:00:00", timezone: "Africa/Cairo" }];

function fakeDb(busy: { starts_at: string; ends_at: string }[]) {
  const answer = (table: string) => {
    if (table === "coach_availability") return { data: RULES, error: null };
    if (table === "coach_availability_exceptions") return { data: [], error: null };
    return { data: null, error: null }; // no settings row: defaults apply
  };
  const chain = (result: unknown): unknown =>
    new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === "then") return (resolve: (v: unknown) => void) => resolve(result);
          if (prop === "maybeSingle") return async () => result;
          return () => chain(result);
        },
      }
    );
  const rpcs: { fn: string; args: unknown }[] = [];
  const db = {
    from: (table: string) => ({ select: () => chain(answer(table)) }),
    rpc: async (fn: string, args: unknown) => {
      rpcs.push({ fn, args });
      return { data: busy, error: null };
    },
  };
  return { db: db as never, rpcs };
}

const FROM = new Date("2026-01-18T00:00:00Z"); // a Sunday
const TO = new Date("2026-01-19T00:00:00Z");
const NOW = new Date("2026-01-10T00:00:00Z");
const starts = (slots: { start: Date }[]) => slots.map((s) => s.start.toISOString());

describe("AvailabilityService.freeSlots", () => {
  it("offers the weekly hours when nothing is busy", async () => {
    const { slots, settings } = await new AvailabilityService(fakeDb([]).db).freeSlots("coach-1", FROM, TO, { now: NOW });
    expect(starts(slots)).toEqual(["2026-01-18T07:00:00.000Z", "2026-01-18T08:00:00.000Z", "2026-01-18T09:00:00.000Z"]);
    expect(settings).toEqual({ cancel_cutoff_hours: 12, slot_minutes: 60, min_notice_hours: 2 });
  });

  it("asks the busy-ranges RPC for exactly the requested window", async () => {
    const fake = fakeDb([]);
    await new AvailabilityService(fake.db).freeSlots("coach-1", FROM, TO, { now: NOW });
    expect(fake.rpcs).toEqual([{ fn: "coach_busy_ranges", args: { p_from: FROM.toISOString(), p_to: TO.toISOString() } }]);
  });

  it("blocks slots the coach is busy in on Google (the RPC returns Google busy blocks alongside appointments)", async () => {
    // 08:00-09:00Z is a Google Calendar commitment; 09:00Z+ is free again.
    const busy = [{ starts_at: "2026-01-18T08:00:00Z", ends_at: "2026-01-18T09:00:00Z" }];
    const { slots } = await new AvailabilityService(fakeDb(busy).db).freeSlots("coach-1", FROM, TO, { now: NOW });
    expect(starts(slots)).toEqual(["2026-01-18T07:00:00.000Z", "2026-01-18T09:00:00.000Z"]);
  });

  it("blocks a slot only partly covered by a Google event", async () => {
    const busy = [{ starts_at: "2026-01-18T07:30:00Z", ends_at: "2026-01-18T08:15:00Z" }];
    const { slots } = await new AvailabilityService(fakeDb(busy).db).freeSlots("coach-1", FROM, TO, { now: NOW });
    expect(starts(slots)).toEqual(["2026-01-18T09:00:00.000Z"]);
  });

  it("surfaces a database error instead of offering slots it can't vouch for", async () => {
    const broken = fakeDb([]);
    (broken.db as unknown as { rpc: unknown }).rpc = async () => ({ data: null, error: { code: "XX000" } });
    await expect(new AvailabilityService(broken.db).freeSlots("coach-1", FROM, TO, { now: NOW })).rejects.toEqual({ code: "XX000" });
  });
});
