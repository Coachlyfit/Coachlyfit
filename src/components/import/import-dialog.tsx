"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MUSCLE_GROUPS } from "@/domain/library/taxonomy";
import {
  FIELDS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  applyMapping,
  autoMap,
  canContinue,
  normalizeHeader,
  validateRows,
  type ImportType,
  type Mapping,
} from "@/domain/imports/fields";
import {
  existingImportKeysAction,
  fetchGoogleSheetAction,
  importRowsAction,
  undoImportAction,
  type ImportResult,
} from "@/domain/imports/import-actions";

type Step = "source" | "map" | "preview" | "result";
type Source = "file" | "sheet";
type Sheet = { headers: string[]; rows: string[][] };
type Done = Exclude<ImportResult, { error: string }>;

const STEPS: Step[] = ["source", "map", "preview", "result"];
const NONE = "-1";

/** Parses an .xlsx / csv text into a header row plus data rows. SheetJS is
 * loaded on first use so it never ships in the page's initial bundle. CSV is
 * passed as text (not bytes): SheetJS would otherwise guess a legacy codepage
 * and mangle Arabic. */
async function toSheet(input: string | ArrayBuffer): Promise<Sheet> {
  const XLSX = await import("xlsx");
  let workbook;
  try {
    workbook = typeof input === "string" ? XLSX.read(input, { type: "string" }) : XLSX.read(input, { type: "array" });
  } catch {
    throw new Error("parse_failed");
  }
  const first = workbook.Sheets[workbook.SheetNames[0]];
  if (!first) throw new Error("empty");

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(first, { header: 1, raw: false, defval: "" });
  const cells = aoa.map((r) => r.map((c) => String(c ?? "").trim())).filter((r) => r.some(Boolean));
  if (cells.length < 2) throw new Error("empty");
  if (cells.length - 1 > MAX_IMPORT_ROWS) throw new Error("too_many_rows");
  return { headers: cells[0], rows: cells.slice(1) };
}

export function ImportDialog({
  type,
  locale,
  onDone,
}: {
  type: ImportType;
  locale: string;
  /** Called after rows were added or removed, for client-side lists to refetch. */
  onDone?: () => void;
}) {
  const t = useTranslations("imports");
  const tCommon = useTranslations("common");
  const tGroups = useTranslations("library.muscleGroups");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("source");
  const [error, setError] = useState<string | null>(null);

  const [source, setSource] = useState<Source>("file");
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [existing, setExisting] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  const [result, setResult] = useState<Done | null>(null);
  const [undone, setUndone] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);

  const fields = FIELDS[type];

  function reset() {
    setStep("source");
    setError(null);
    setSource("file");
    setFileName(null);
    setSheetUrl("");
    setSheet(null);
    setMapping({});
    setExisting([]);
    setExcluded(new Set());
    setResult(null);
    setUndone(false);
    setConfirmUndo(false);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function loaded(next: Sheet) {
    setSheet(next);
    setMapping(autoMap(next.headers, type));
    setError(null);
    setStep("map");
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setFileName(file.name);
    if (file.size > MAX_IMPORT_BYTES) {
      setError("file_too_large");
      return;
    }
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".csv")) {
      setError("parse_failed");
      return;
    }
    startTransition(async () => {
      try {
        loaded(await toSheet(lower.endsWith(".csv") ? await file.text() : await file.arrayBuffer()));
      } catch (e) {
        setError(e instanceof Error ? e.message : "parse_failed");
      }
    });
  }

  function onFetchSheet() {
    setError(null);
    startTransition(async () => {
      const res = await fetchGoogleSheetAction(sheetUrl);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      try {
        loaded(await toSheet(res.csv));
      } catch (e) {
        setError(e instanceof Error ? e.message : "parse_failed");
      }
    });
  }

  function downloadTemplate() {
    startTransition(async () => {
      const XLSX = await import("xlsx");
      const sheetData = XLSX.utils.aoa_to_sheet([
        fields.map((f) => t(`fields.${f.key}`)),
        fields.map((f) => t(`example.${f.key}`)),
      ]);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheetData, "Sheet1");
      if (locale === "ar") book.Workbook = { Views: [{ RTL: true }] };
      XLSX.writeFile(book, `${type}-template.xlsx`);
    });
  }

  function toPreview() {
    setError(null);
    startTransition(async () => {
      const res = await existingImportKeysAction(type);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setExisting(res.keys);
      setExcluded(new Set());
      setStep("preview");
    });
  }

  // Translated muscle-group labels -> keys, so a sheet written with the
  // app's own (Arabic or English) labels maps to real values.
  const muscleLabels = useMemo(
    () => Object.fromEntries(MUSCLE_GROUPS.map((k) => [normalizeHeader(tGroups(k)), k])),
    [tGroups]
  );
  const mapped = useMemo(() => (sheet ? applyMapping(type, sheet.rows, mapping) : []), [sheet, type, mapping]);
  const checked = useMemo(
    () => (step === "preview" ? validateRows(type, mapped, existing, muscleLabels) : []),
    [step, type, mapped, existing, muscleLabels]
  );
  const selected = checked.flatMap((c, i) => (c.ok && !excluded.has(i) ? [i] : []));
  const problems = checked.filter((c) => !c.ok).length;

  function submit() {
    setError(null);
    const rows = selected.map((i) => {
      const c = checked[i];
      return c.ok ? (c.data as Record<string, string>) : {};
    });
    startTransition(async () => {
      const res = await importRowsAction(locale, type, rows);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setResult(res);
      setStep("result");
      onDone?.();
    });
  }

  function undo() {
    const importId = result?.importId;
    if (!importId) return;
    startTransition(async () => {
      const res = await undoImportAction(locale, importId);
      setConfirmUndo(false);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setError(null);
      setUndone(true);
      toast.success(t("result.undone", { count: res.deleted }));
      onDone?.();
    });
  }

  const stepIndex = STEPS.indexOf(step);
  const errorText = error ? (t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.unknown")) : null;
  const mappedFields = fields.filter((f) => mapping[f.key] != null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Upload className="size-4" />
        {t("trigger")}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] gap-4 overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
            {t("stepOf", { step: stepIndex + 1, total: STEPS.length, name: t(`steps.${step}`) })}
          </span>
          <DialogTitle>{t(`title.${type}`)}</DialogTitle>
          <DialogDescription>{t(`subtitle.${type}`)}</DialogDescription>
        </DialogHeader>

        {step === "source" && (
          <div className="flex flex-col gap-4">
            <Segmented
              label={t("source.label")}
              value={source}
              onChange={(v) => {
                setSource(v);
                setError(null);
              }}
              options={[
                { value: "file", label: t("source.file") },
                { value: "sheet", label: t("source.sheet") },
              ]}
            />

            {source === "file" ? (
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept=".xlsx,.csv"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(e) => {
                    onFile(e.target.files?.[0]);
                    e.target.value = ""; // picking the same file again must re-fire
                  }}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="outline" disabled={pending} onClick={() => fileInput.current?.click()}>
                    <Upload className="size-4" />
                    {fileName ? t("source.change") : t("source.choose")}
                  </Button>
                  {fileName && (
                    <span dir="auto" className="min-w-0 truncate text-sm text-muted-foreground">
                      {pending ? t("source.reading") : fileName}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{t("source.fileHint")}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="import-sheet-url">{t("source.sheetLabel")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="import-sheet-url"
                    dir="ltr"
                    inputMode="url"
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    placeholder={t("source.sheetPlaceholder")}
                    className="font-mono text-xs"
                  />
                  <Button type="button" onClick={onFetchSheet} disabled={pending || sheetUrl.trim() === ""} className="min-w-24">
                    {pending ? t("source.fetching") : t("source.fetch")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t("source.sheetHint")}</p>
                <p className="text-xs text-muted-foreground">{t("source.formsHint")}</p>
              </div>
            )}

            <Button type="button" variant="link" size="sm" className="self-start px-0" onClick={downloadTemplate}>
              <Download className="size-4" />
              {t("source.template")}
            </Button>
          </div>
        )}

        {step === "map" && sheet && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{t("map.subtitle")}</p>
            <p className="font-mono text-xs text-muted-foreground">{t("map.found", { rows: sheet.rows.length })}</p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("map.field")}</TableHead>
                    <TableHead>{t("map.column")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((f) => {
                    const items = [
                      { value: NONE, label: t("map.notMapped") },
                      ...sheet.headers.map((h, i) => ({ value: String(i), label: `${i + 1}. ${h || "—"}` })),
                    ];
                    return (
                      <TableRow key={f.key}>
                        <TableCell className="text-start">
                          <span className="font-medium">{t(`fields.${f.key}`)}</span>
                          {f.required && (
                            <Badge variant="secondary" className="ms-2">
                              {t("map.required")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="min-w-48">
                          <Select
                            value={String(mapping[f.key] ?? NONE)}
                            onValueChange={(v) =>
                              setMapping((m) => ({ ...m, [f.key]: v == null || v === NONE ? null : Number(v) }))
                            }
                            items={items}
                          >
                            <SelectTrigger size="sm" className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {items.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {!canContinue(type, mapping) && (
              <p className="text-sm text-muted-foreground">{type === "clients" ? t("map.needName") : t("map.needAnyName")}</p>
            )}
          </div>
        )}

        {step === "preview" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{t("preview.subtitle")}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {t("preview.summary", {
                ready: selected.length,
                problems,
                excluded: excluded.size,
              })}
            </p>
            <div className="max-h-[45vh] overflow-auto rounded-lg border border-border">
              <Table>
                <TableHeader className="sticky top-0 bg-muted">
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead className="w-14 text-start">{t("preview.row")}</TableHead>
                    {mappedFields.map((f) => (
                      <TableHead key={f.key} className="text-start">
                        {t(`fields.${f.key}`)}
                      </TableHead>
                    ))}
                    <TableHead className="text-start">{t("preview.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checked.map((c, i) => (
                    <TableRow key={i} className={c.ok && !excluded.has(i) ? undefined : "opacity-60"}>
                      <TableCell>
                        <Checkbox
                          aria-label={t("preview.include", { row: i + 1 })}
                          checked={c.ok && !excluded.has(i)}
                          disabled={!c.ok}
                          onCheckedChange={(on) =>
                            setExcluded((prev) => {
                              const next = new Set(prev);
                              if (on === true) next.delete(i);
                              else next.add(i);
                              return next;
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                      {mappedFields.map((f) => (
                        <TableCell key={f.key} dir="auto" className="max-w-44 truncate text-start">
                          {mapped[i]?.[f.key]}
                        </TableCell>
                      ))}
                      <TableCell className="text-start">
                        {c.ok ? (
                          <Badge variant="success">{t("preview.ok")}</Badge>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {c.errors.map((e) => (
                              <Badge key={e} variant={e === "duplicate" ? "warning" : "destructive"}>
                                {t(`rowErrors.${e}`)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {step === "result" && result && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3">
              <Stat label={t("result.imported")} value={undone ? 0 : result.imported} />
              <Stat label={t("result.skipped")} value={result.skipped} />
              <Stat label={t("result.failed")} value={result.failed} />
            </div>
            {result.overLimit > 0 && (
              <p role="status" className="text-sm text-muted-foreground">
                {t("result.overLimit", { count: result.overLimit })}
              </p>
            )}
            {result.imported === 0 && <p className="text-sm text-muted-foreground">{t("result.nothing")}</p>}
          </div>
        )}

        {errorText && (
          <p role="alert" className="text-sm text-destructive">
            {errorText}
          </p>
        )}

        <DialogFooter>
          {step === "map" && (
            <>
              <Button variant="outline" onClick={() => setStep("source")} disabled={pending}>
                {tCommon("back")}
              </Button>
              <Button onClick={toPreview} disabled={pending || !canContinue(type, mapping)} className="min-w-24">
                {pending ? t("preview.loading") : tCommon("next")}
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("map")} disabled={pending}>
                {tCommon("back")}
              </Button>
              <Button onClick={submit} disabled={pending || selected.length === 0} className="min-w-24">
                {pending ? tCommon("pending") : t("submit", { count: selected.length })}
              </Button>
            </>
          )}
          {step === "result" && (
            <>
              {result?.importId && !undone && (
                <Button variant="outline" onClick={() => setConfirmUndo(true)} disabled={pending}>
                  {t("result.undo")}
                </Button>
              )}
              <Button onClick={() => onOpenChange(false)} disabled={pending}>
                {t("result.done")}
              </Button>
            </>
          )}
        </DialogFooter>

        <ConfirmDialog
          open={confirmUndo}
          onOpenChange={setConfirmUndo}
          title={t("result.undoTitle")}
          description={t("result.undoBody", { count: result?.imported ?? 0 })}
          confirmLabel={t("result.undo")}
          onConfirm={undo}
          pending={pending}
        />
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-3 text-center">
      <div className="font-mono text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
