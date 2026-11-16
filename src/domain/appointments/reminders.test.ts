import { describe, expect, it } from "vitest";
import { AppointmentReminders, bookedBeforeWindow, reminderWindows } from "./reminders";

const NOW = new Date("2026-01-18T10:00:00Z");

type Cand = {
  id: string;
  starts_at: string;
  created_at: string;
  type: string;
  coach_id: string;
  client: { display_name: string; profile_id: string | null; assigned_to: string | null } | null;
  coach: { business_name: string } | null;
};

function candidate(over: Partial<Cand> = {}): Cand {
  return {
    id: "a1",
    starts_at: "2026-01-19T09:00:00Z", // 23h out
    created_at: "2026-01-10T09:00:00Z",
    type: "online",
    coach_id: "coach-1",
    client: { display_name: "Sara", profile_id: "client-p", assigned_to: null },
    coach: { business_name: "Coach Co" },
    ...over,
  };
}

/** Select #1 is the 24h window, #2 the 1h window. Every update claims `claimed`. */
function fakeSupabase(selects: Cand[][], claimed: string[]) {
  const inserts: Record<string, unknown>[] = [];
  let selectCall = 0;
  const chain = (result: unknown) => {
    const c: unknown = new Proxy(
      {},
      { get: (_t, prop) => (prop === "then" ? (resolve: (v: unknown) => void) => resolve(result) : () => c) }
    );
    return c;
  };
  const db = {
    from: () => ({
      select: () => chain({ data: selects[selectCall++] ?? [], error: null }),
      update: () => chain({ data: claimed.map((id) => ({ id })), error: null }),
      insert: async (rows: Record<string, unknown>[]) => {
        inserts.push(...rows);
        return { error: null };
      },
    }),
  };
  return { db: db as never, inserts };
}

describe("reminderWindows", () => {
  it("24h window stops 2h out; 1h window starts now", () => {
    const [d, h] = reminderWindows(NOW);
    expect(d.to - d.from).toBe(22 * 3_600_000);
    expect(h.from).toBe(NOW.getTime());
    expect(h.to).toBe(NOW.getTime() + 3_600_000);
  });
});

describe("bookedBeforeWindow", () => {
  it("is false when the session was booked inside the reminder window", () => {
    expect(bookedBeforeWindow("2026-01-18T18:00:00Z", "2026-01-19T09:00:00Z", 24)).toBe(false);
    expect(bookedBeforeWindow("2026-01-10T18:00:00Z", "2026-01-19T09:00:00Z", 24)).toBe(true);
  });
});

describe("AppointmentReminders.sendDue", () => {
  it("notifies the coach and the client for a claimed appointment", async () => {
    const { db, inserts } = fakeSupabase([[candidate()], []], ["a1"]);
    expect(await new AppointmentReminders(db).sendDue(NOW)).toBe(2);
    expect(inserts.map((r) => [r.profile_id, (r.payload as { audience: string }).audience])).toEqual([
      ["coach-1", "coach"],
      ["client-p", "client"],
    ]);
  });

  it("also tells the assigned team member", async () => {
    const c = candidate({ client: { display_name: "Sara", profile_id: null, assigned_to: "member-1" } });
    const { db, inserts } = fakeSupabase([[c], []], ["a1"]);
    await new AppointmentReminders(db).sendDue(NOW);
    expect(inserts.map((r) => r.profile_id)).toEqual(["coach-1", "member-1"]);
  });

  it("sends nothing when another run already claimed the row", async () => {
    const { db, inserts } = fakeSupabase([[candidate()], []], []);
    expect(await new AppointmentReminders(db).sendDue(NOW)).toBe(0);
    expect(inserts).toEqual([]);
  });

  it("skips a session booked inside the window", async () => {
    const c = candidate({ created_at: "2026-01-18T09:30:00Z" });
    const { db, inserts } = fakeSupabase([[c], []], ["a1"]);
    expect(await new AppointmentReminders(db).sendDue(NOW)).toBe(0);
    expect(inserts).toEqual([]);
  });
});
