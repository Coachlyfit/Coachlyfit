import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AppLocale } from "@/domain/locale";
import { formatDate } from "@/lib/format";

export type AuditEntry = {
  id: string;
  created_at: string;
  admin_name: string | null;
  target_name: string | null;
  target_email: string | null;
  action: string;
  details: unknown;
};

type Change = { from: unknown; to: unknown };

export function changes(details: unknown): [string, Change][] {
  if (!details || typeof details !== "object") return [];
  return Object.entries(details as Record<string, unknown>).filter(
    (e): e is [string, Change] => !!e[1] && typeof e[1] === "object" && "to" in e[1]
  );
}

/** Text of an internal note entry (action "note"), else null. */
export function noteOf(details: unknown): string | null {
  const note = (details as { note?: unknown } | null)?.note;
  return typeof note === "string" ? note : null;
}

export const show = (v: unknown) => (v == null || v === "" ? "—" : String(v));

export function AuditTab({ locale, entries }: { locale: AppLocale; entries: AuditEntry[] }) {
  const t = useTranslations("admin.settings.audit");

  if (entries.length === 0) return <p className="text-muted-foreground text-sm">{t("empty")}</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("when")}</TableHead>
          <TableHead>{t("admin")}</TableHead>
          <TableHead>{t("action")}</TableHead>
          <TableHead>{t("target")}</TableHead>
          <TableHead>{t("details")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((e) => (
          <TableRow key={e.id}>
            <TableCell className="text-muted-foreground whitespace-nowrap">
              {formatDate(e.created_at, locale, { dateStyle: "medium", timeStyle: "short" })}
            </TableCell>
            <TableCell>{e.admin_name ?? "—"}</TableCell>
            <TableCell>
              <Badge variant={e.action === "delete" ? "destructive" : "secondary"}>
                {t.has(`actions.${e.action}`) ? t(`actions.${e.action}`) : e.action}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="font-medium">{e.target_name ?? "—"}</div>
              <div className="text-muted-foreground text-xs" dir="ltr">
                {e.target_email ?? "—"}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground text-xs">
              {changes(e.details).map(([field, c]) => (
                <div key={field}>
                  {t.has(`fields.${field}`) ? t(`fields.${field}`) : field}: {show(c.from)} → {show(c.to)}
                </div>
              ))}
              {noteOf(e.details) && <div className="whitespace-pre-wrap">{noteOf(e.details)}</div>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
