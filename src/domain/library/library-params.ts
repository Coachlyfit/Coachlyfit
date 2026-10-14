import { EQUIPMENT, FOOD_CATEGORIES, MUSCLE_GROUPS } from "./taxonomy";
import type { LibraryQuery, LibrarySource } from "./library.service";
import { RECIPE_SORTS, type RecipeQuery, type RecipeSort } from "@/domain/recipes/recipes.service";

export const LIBRARY_TABS = ["exercises", "foods", "recipes"] as const;
export const LIBRARY_VIEWS = ["list", "card", "kanban"] as const;
const SOURCES = ["all", "global", "mine"] as const satisfies readonly LibrarySource[];

export type LibraryTab = (typeof LIBRARY_TABS)[number];
export type LibraryView = (typeof LIBRARY_VIEWS)[number];

/** Everything about the library page that survives a refresh. `group` is the
 * exercises tab's muscle group and `cat` the foods tab's category — separate
 * vocabularies, so each tab keeps its own. `sort` and `tag` are the recipes
 * tab's. `page` belongs to the active tab. */
export type LibraryParams = {
  tab: LibraryTab;
  view: LibraryView;
  q: string;
  source: LibrarySource;
  group: string | null;
  cat: string | null;
  equip: string | null;
  sort: RecipeSort;
  tag: string | null;
  page: number;
};

export const DEFAULT_LIBRARY_PARAMS: LibraryParams = {
  tab: "exercises",
  view: "list",
  q: "",
  source: "all",
  group: null,
  cat: null,
  equip: null,
  sort: "newest",
  tag: null,
  page: 1,
};

const MAX_QUERY_LENGTH = 100;

function oneOf<T extends string>(allowed: readonly T[], value: string | null): T | null {
  return (allowed as readonly string[]).includes(value ?? "") ? (value as T) : null;
}

/** The query string is user input: anything not on a whitelist falls back to
 * the default instead of reaching a query or a translation lookup. */
export function parseLibraryParams(search: URLSearchParams): LibraryParams {
  const page = Number(search.get("page"));
  return {
    tab: oneOf(LIBRARY_TABS, search.get("tab")) ?? DEFAULT_LIBRARY_PARAMS.tab,
    view: oneOf(LIBRARY_VIEWS, search.get("view")) ?? DEFAULT_LIBRARY_PARAMS.view,
    q: (search.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH),
    source: oneOf(SOURCES, search.get("source")) ?? DEFAULT_LIBRARY_PARAMS.source,
    group: oneOf(MUSCLE_GROUPS, search.get("group")),
    cat: oneOf(FOOD_CATEGORIES, search.get("cat")),
    equip: oneOf(EQUIPMENT, search.get("equip")),
    sort: oneOf(RECIPE_SORTS, search.get("sort")) ?? DEFAULT_LIBRARY_PARAMS.sort,
    // Tags are the coach's own words, so there's no whitelist; only the
    // same length cap the DB puts on a tag.
    tag: search.get("tag")?.trim().slice(0, 24) || null,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** Inverse of parseLibraryParams, defaults omitted so the untouched page
 * keeps a clean URL. No leading "?". */
export function serializeLibraryParams(params: LibraryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === DEFAULT_LIBRARY_PARAMS[key as keyof LibraryParams]) continue;
    search.set(key, String(value));
  }
  return search.toString();
}

const LIST_PAGE_SIZE = 24;
// Kanban needs more items per column than a page of list/card rows.
const KANBAN_PAGE_SIZE = 48;

export function libraryPageSize(view: LibraryView) {
  return view === "kanban" ? KANBAN_PAGE_SIZE : LIST_PAGE_SIZE;
}

// The one mapping from URL state to a service query, shared by the server
// page (first paint) and the client (every later fetch) so the two can't
// disagree about what a given URL shows.
export function exerciseQuery(params: LibraryParams): LibraryQuery {
  return {
    query: params.q,
    source: params.source,
    group: params.group,
    equipment: params.equip,
    page: params.page,
    pageSize: libraryPageSize(params.view),
  };
}

export function foodQuery(params: LibraryParams): LibraryQuery {
  return {
    query: params.q,
    source: params.source,
    group: params.cat,
    page: params.page,
    pageSize: libraryPageSize(params.view),
  };
}

export function recipeQuery(params: LibraryParams, locale: "ar" | "en"): RecipeQuery {
  return {
    query: params.q,
    tag: params.tag,
    sort: params.sort,
    locale,
    page: params.page,
    pageSize: LIST_PAGE_SIZE,
  };
}
