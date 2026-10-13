import { z } from "zod";

export type ImportRow = {
  email: string;
  name: string | null;
  source: string | null;
  /** `duplicate` is a repeat inside the pasted text. An address that is
   * already a lead is only known to the database and is skipped there. */
  state: "ok" | "invalid" | "duplicate";
};

const emailSchema = z.string().email().max(320);

/** Reads pasted or uploaded CSV with the columns `email,name,source` (name
 * and source optional, a header row is skipped). Commas only, no quoting:
 * the file is a hand-made list of a few dozen people. */
export function parseLeadsCsv(raw: string): ImportRow[] {
  const seen = new Set<string>();
  const rows: ImportRow[] = [];

  for (const line of raw.replace(/^﻿/, "").split(/\r?\n/)) {
    const [first = "", name = "", source = ""] = line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
    const email = first.toLowerCase();
    if (!email || (rows.length === 0 && email === "email")) continue;

    const state = !emailSchema.safeParse(email).success ? "invalid" : seen.has(email) ? "duplicate" : "ok";
    seen.add(email);
    rows.push({ email, name: name.slice(0, 100) || null, source: source.slice(0, 50) || null, state });
  }
  return rows;
}
