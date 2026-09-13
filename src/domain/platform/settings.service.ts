import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  platformSettingsSchemas,
  SETTINGS_DEFAULTS,
  isSettingKey,
  type PlatformSettings,
  type SettingKey,
} from "./settings.schema";

/** Key/value platform_settings table -> typed PlatformSettings. A missing
 * or malformed row (bad migration, manual DB edit) falls back to the
 * default for that key rather than throwing -- this is read on every
 * coach/client layout render, so it must never break the app. */
export class PlatformSettingsService {
  constructor(private db: SupabaseClient<Database>) {}

  async getAll(): Promise<PlatformSettings> {
    const { data, error } = await this.db.from("platform_settings").select("key, value");
    if (error) throw error;

    const result = { ...SETTINGS_DEFAULTS };
    for (const row of data ?? []) {
      if (!isSettingKey(row.key)) continue;
      const parsed = platformSettingsSchemas[row.key].safeParse(row.value);
      if (parsed.success) {
        // Each schema's inferred type matches its own key by construction;
        // the union collapses under a single index signature here.
        (result as Record<SettingKey, unknown>)[row.key] = parsed.data;
      }
    }
    return result;
  }

  async set<K extends SettingKey>(key: K, value: PlatformSettings[K], userId: string): Promise<void> {
    const parsed = platformSettingsSchemas[key].parse(value);
    const { error } = await this.db
      .from("platform_settings")
      .upsert({ key, value: parsed, updated_at: new Date().toISOString(), updated_by: userId });
    if (error) throw error;
  }
}
