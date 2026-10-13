"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import { parseLeadsCsv } from "@/domain/leads/import";
import { importLeadsAction } from "./actions";

const ROW_TONE = { ok: "success", invalid: "destructive", duplicate: "warning" } as const;
const ROW_LABEL = { ok: "rowOk", invalid: "rowInvalid", duplicate: "rowDuplicate" } as const;

/** Paste or upload `email,name,source`, look at what was understood, import.
 * Bad addresses and repeats are shown and left out; addresses that are
 * already leads are skipped by the database and counted in the result. */
export function ImportDialog({ locale, onClose }: { locale: string; onClose: () => void }) {
  const t = useTranslations("admin.leads.importDialog");
  const tErrors = useTranslations("admin.leads.errors");
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const rows = useMemo(() => parseLeadsCsv(text), [text]);
  const valid = rows.filter((row) => row.state === "ok");

  function onImport() {
    startTransition(async () => {
      const response = await importLeadsAction(
        locale,
        valid.map(({ email, name, source }) => ({ email, name, source }))
      );
      if ("error" in response) return void toast.error(tErrors.has(response.error) ? tErrors(response.error) : tErrors("save_failed"));
      setResult({ added: response.added, skipped: response.skipped + rows.length - valid.length });
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { columns: "email,name,source" })}</DialogDescription>
        </DialogHeader>

        {result ? (
          <p className="text-sm" role="status">
            {t("result", result)}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="leads-import-text">{t("paste")}</Label>
              <Textarea
                id="leads-import-text"
                dir="ltr"
                rows={5}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"email,name,source\nsara@example.com,Sara,instagram"}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="leads-import-file">{t("file")}</Label>
              <Input
                id="leads-import-file"
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) setText(await file.text());
                }}
              />
            </div>

            {rows.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {t("previewCount", { ok: valid.length, skipped: rows.length - valid.length })}
                </p>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("email")}</TableHead>
                        <TableHead>{t("name")}</TableHead>
                        <TableHead>{t("source")}</TableHead>
                        <TableHead>
                          <span className="sr-only">{t("state")}</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, index) => (
                        <TableRow key={index}>
                          <TableCell dir="ltr" className="max-w-56 truncate text-start">
                            {row.email}
                          </TableCell>
                          <TableCell>{row.name ?? "—"}</TableCell>
                          <TableCell>{row.source ?? "—"}</TableCell>
                          <TableCell>
                            <StatusBadge tone={ROW_TONE[row.state]}>{t(ROW_LABEL[row.state])}</StatusBadge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            {result ? t("close") : t("cancel")}
          </Button>
          {!result && (
            <Button type="button" onClick={onImport} disabled={pending || valid.length === 0} className="min-w-24">
              {t("import", { count: valid.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
