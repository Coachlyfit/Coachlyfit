"use client";

import { useTranslations } from "next-intl";
import { muscleGroupWeeklyVolume, muscleWeeklyVolume } from "@/domain/programs/volume";
import type { ProgramTree } from "@/domain/programs/programs.service";
import { BodyMap } from "@/components/body-map/body-map";

/** Sets/week by muscle group — pure derived data from the already-loaded
 * tree (muscleGroupWeeklyVolume), no fetch of its own. Week-invariant (see
 * volume.ts), so it doesn't take the builder's selected week as a prop. */
export function VolumeSidebar({ days }: { days: ProgramTree["program_days"] }) {
  const t = useTranslations("programs.volume");
  const tGroups = useTranslations("library.muscleGroups");
  const volumes = muscleGroupWeeklyVolume(days).filter((v) => v.sets > 0);
  const max = Math.max(1, ...volumes.map((v) => v.sets));
  const muscleState = muscleWeeklyVolume(days);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <h3 className="text-sm font-semibold">{t("title")}</h3>
      {Object.keys(muscleState).length > 0 && (
        <BodyMap state={muscleState} ariaLabel={t("title")} className="mx-auto max-w-[200px]" />
      )}
      {volumes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {volumes.map((v) => (
            <div key={v.muscleGroup} className="flex items-center gap-2 text-xs">
              <span className="w-16 shrink-0 truncate text-muted-foreground">{tGroups(v.muscleGroup)}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(v.sets / max) * 100}%` }} />
              </div>
              <span className="w-6 shrink-0 text-end font-mono tabular-nums">{v.sets}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
