"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

/** Generic archived-items list + restore, reused by library/programs/diets —
 * each domain only differs in what listArchived/restore call and how a row
 * renders, so this is the one place the trash UI itself lives. */
export function TrashDialog<T extends { id: string }>({
  listArchived,
  restore,
  renderRow,
  onRestored,
}: {
  listArchived: () => Promise<T[]>;
  restore: (id: string) => Promise<{ error: string } | void>;
  renderRow: (item: T) => string;
  onRestored: () => void;
}) {
  const t = useTranslations("common.trash");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<T[] | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setItems(await listArchived());
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore(id: string) {
    setRestoringId(id);
    const result = await restore(id);
    setRestoringId(null);
    if (result && "error" in result) {
      toast.error(t("restoreFailed"));
      return;
    }
    setItems((prev) => prev?.filter((i) => i.id !== id) ?? null);
    onRestored();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Trash2 className="size-4" />
        {t("trigger")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !items || items.length === 0 ? (
          <EmptyState title={t("empty")} />
        ) : (
          <ul className="max-h-96 space-y-1 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <span className="truncate">{renderRow(item)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={restoringId === item.id}
                  onClick={() => handleRestore(item.id)}
                >
                  <RotateCcw className="size-4" />
                  {t("restore")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
