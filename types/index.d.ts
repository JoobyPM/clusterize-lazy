/**
 * Clusterize‑Lazy – TypeScript definitions
 * Version: 1.0.0
 *
 * These typings intentionally expose a **generic** API so you can describe
 * the structure of your row objects and (optionally) primary‑key type.
 *
 * Example:
 * ```ts
 * import Clusterize, { ClusterizeOptions } from "clusterize-lazy";
 *
 * interface UserRow { id: number; firstName: string; lastName: string }
 * const opts: ClusterizeOptions<UserRow, number> = { ... };
 * const cluster = new Clusterize<UserRow, number>(opts);
 * ```
 */

export type RowArray<R> = R[];

/**
 * Return type accepted by `fetchOnInit`.
 */
export interface FetchInitResponse<R> {
  /** Total rows in the dataset */
  totalRows: number;
  /** First page of rows (may be empty) */
  rows: RowArray<R>;
}

/**
 * Options object passed to the constructor (generic in *R* - the row type, and *K* - the primary‑key type).
 */
export interface ClusterizeOptions<R = unknown, K = any> {
  /* Required */
  rowHeight: number;
  /** Called once on construction to obtain the very first data page - or at least a count. */
  fetchOnInit: () => Promise<RowArray<R> | FetchInitResponse<R>>;
  /** Called whenever the component needs more rows starting at *offset*. */
  fetchOnScroll: (offset: number) => Promise<RowArray<R>>;
  /** Renders a placeholder skeleton while a row is still loading. */
  renderSkeletonRow: (height: number, index: number) => string;

  /* Optional */
  /** Convert a *row object* to HTML. Required when the fetchers return objects rather than pre‑rendered HTML strings. */
  renderRaw?: (index: number, data: R) => string;

  /** Extra rows rendered above & below viewport (default 5). */
  buffer?: number;
  /** Row cache time‑to‑live in milliseconds (default: `Infinity`, meaning never evict). */
  cacheTTL?: number;
  /** Debounce delay for scroll‑triggered fetches (default 120 ms). */
  debounceMs?: number;

  /* DOM hooks (pass *either* the element itself or its id) */
  scrollElem?: HTMLElement;
  scrollId?: string;
  contentElem?: HTMLElement;
  contentId?: string;

  /* Primary‑key indexing (for fast update/delete by id) */
  buildIndex?: boolean;
  /** Field name used to extract the key from row objects (default "id"). */
  primaryKey?: string;

  /* Misc UX hooks */
  /** Custom empty‑state renderer or static HTML. */
  renderEmptyState?: (() => string) | string;
  /** Fires once after scrolling stops for 100 ms. */
  onScrollFinish?: (firstVisibleRow: number) => void;
  /** Continuous progress callback each render. */
  scrollingProgress?: (firstVisibleRow: number) => void;
}

/** Entry used by {@link Clusterize.update}. */
export interface UpdateEntry<R, K = any> {
  /** Zero‑based index of the row to replace (preferred when known). */
  index?: number;
  /** Primary‑key value (requires `buildIndex`). */
  id?: K;
  /** New row data (string or object depending on setup). */
  data: R;
}

/** Returned by the private debug helper `_dump()`. */
export interface DebugDump<R, K = any> {
  totalRows: number | null;
  cache: Array<{
    html: string;
    ts: number;
    key: K | null;
  } | undefined>;
  /** Present only when `buildIndex` is true. */
  index: Map<K, number> | null;
}

/**
 * Clusterize‑Lazy public API class.
 */
export default class Clusterize<R = unknown, K = any> {
  constructor(options: ClusterizeOptions<R, K>);

  /* ————— Mutators ————— */
  insert(rows: RowArray<R>, offset?: number): void;
  update(updates: Array<UpdateEntry<R, K>>): void;
  /** Remove rows by indices or primary keys. */
  delete(keys: Array<number | K>): void;
  /** Replace the entire dataset (useful for search/filter). */
  applyFilter(newTotal: number, rows?: RowArray<R>): void;

  /* ————— House‑keeping ————— */
  invalidateCache(): void;
  recalculateHeight(): void;
  destroy(): void;

  /* ————— Scrolling helpers ————— */
  scrollToRow(index: number, smooth?: boolean): void;
  scrollingProgress(cb: ((firstVisibleRow: number) => void) | null): void;

  /* ————— Renderer helpers ————— */
  renderEmptyState(renderer: (() => string) | string | null): void;
  refresh(): void;

  /* ————— Diagnostics ————— */
  getLoadedCount(): number;
  /** Debug method - **not** part of the stable API, may change without notice. */
  _dump(): DebugDump<R, K>;
}
