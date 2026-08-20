import type { CreateInviteInput } from "./invites.service";

export type ImportField = "name" | "phone" | "goal" | "fee" | "skip";

/** Splits a pasted roster into rows/cells. Coaches paste from Excel (tabs),
 * Notes (commas or runs of spaces), or a WhatsApp export — never a clean
 * CSV — so the delimiter is guessed per line rather than fixed. */
export function parseRoster(raw: string): string[][] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line
        .split(/\t|,|\s{2,}/)
        .map((cell) => cell.trim())
        .filter(Boolean)
    );
}

const PHONE_RE = /^[\d+\s-]{7,}$/;
const FEE_RE = /^\d+$/;

/** Guesses a field for each column from the shape of its values, not a
 * header row (pasted rosters rarely have one). First unclaimed text column
 * wins "name" — everything else defaults to "skip" rather than a guess
 * that's wrong more often than no guess at all. */
export function guessFields(rows: string[][]): ImportField[] {
  const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const fields: ImportField[] = Array(width).fill("skip");
  let nameAssigned = false;

  for (let col = 0; col < width; col++) {
    const values = rows.map((r) => r[col]).filter(Boolean);
    if (values.length === 0) continue;

    if (values.every((v) => PHONE_RE.test(v) && /\d{6,}/.test(v))) {
      fields[col] = "phone";
    } else if (values.every((v) => FEE_RE.test(v))) {
      fields[col] = "fee";
    } else if (!nameAssigned) {
      fields[col] = "name";
      nameAssigned = true;
    }
    // Anything else (e.g. a "goal" free-text column) stays "skip" — the
    // coach maps it explicitly in the mapping step.
  }

  return fields;
}

/** Turns parsed rows into invite inputs per the chosen mapping. Rows without
 * a usable name (the only required field) are dropped rather than sent to
 * the DB — InvitesService.createInvites reports how many rows it received
 * vs. how many actually got created. */
export function toInvites(rows: string[][], fields: ImportField[]): CreateInviteInput[] {
  const nameIdx = fields.indexOf("name");
  const phoneIdx = fields.indexOf("phone");

  return rows
    .map((row) => {
      const phone = phoneIdx >= 0 ? row[phoneIdx]?.trim() : undefined;
      return {
        displayName: (nameIdx >= 0 ? row[nameIdx] : row[0])?.trim() ?? "",
        ...(phone ? { phone } : {}),
      };
    })
    .filter((r): r is CreateInviteInput => r.displayName.length > 0);
}
