/**
 * Generic pagination helpers for Alpaca's `next_page_token` style endpoints.
 *
 * The generated APIs expose the page token on responses but do not auto-follow
 * it. These helpers let callers iterate every item across pages without
 * hand-rolling the loop. They are transport-agnostic: you adapt each SDK call
 * into a `Page<T>` and the helper drives the cursor until it is exhausted.
 *
 * @example
 * ```ts
 * import { marketData, pagination } from "@alpaca/sdk";
 *
 * const stocks = new marketData.StockApi(config);
 * for await (const trade of pagination.paginate(async (pageToken) => {
 *   const resp = await stocks.stockTrades({ symbols: "AAPL", pageToken });
 *   return { items: resp.trades?.["AAPL"] ?? [], nextPageToken: resp.nextPageToken };
 * })) {
 *   console.log(trade);
 * }
 * ```
 */

export interface Page<T> {
    /** Items contained in this page. */
    items: T[];
    /** Token for the next page; `null`/`undefined`/`""` means no more pages. */
    nextPageToken?: string | null;
}

/** A function that fetches a single page given an optional page token. */
export type PageFetcher<T> = (pageToken?: string) => Promise<Page<T>>;

/**
 * Lazily yields every item across all pages, following `nextPageToken` until
 * the API stops returning one.
 */
export async function* paginate<T>(fetchPage: PageFetcher<T>): AsyncGenerator<T, void, void> {
    let pageToken: string | undefined = undefined;
    do {
        const page = await fetchPage(pageToken);
        for (const item of page.items ?? []) {
            yield item;
        }
        pageToken = page.nextPageToken ? page.nextPageToken : undefined;
    } while (pageToken);
}

/**
 * Eagerly collects every item across all pages into a single array.
 * Convenience wrapper over {@link paginate}; beware unbounded result sets.
 */
export async function collect<T>(fetchPage: PageFetcher<T>): Promise<T[]> {
    const out: T[] = [];
    for await (const item of paginate(fetchPage)) {
        out.push(item);
    }
    return out;
}

// --- Multi-symbol map pagination ------------------------------------------
//
// Several market-data endpoints return data keyed by symbol, e.g.
// `StockBarsResp.bars: { [symbol]: StockBar[] }`, alongside a `next_page_token`.
// Naively following the token leaves the integrator to merge per-symbol arrays
// across pages. These helpers do that merge for you.

/** A page whose payload is a `{ [symbol]: T[] }` map plus an optional token. */
export interface SymbolMapPage<T> {
    /** Per-symbol arrays for this page. */
    data: { [symbol: string]: T[] };
    /** Token for the next page; `null`/`undefined`/`""` means no more pages. */
    nextPageToken?: string | null;
}

/** Fetches a single `{ [symbol]: T[] }` page given an optional page token. */
export type SymbolMapPageFetcher<T> = (pageToken?: string) => Promise<SymbolMapPage<T>>;

/**
 * Lazily yields every `{ symbol, value }` record across all symbols and pages
 * of a symbol-keyed response, following the page token until exhausted.
 */
export async function* paginateSymbolMap<T>(
    fetchPage: SymbolMapPageFetcher<T>,
): AsyncGenerator<{ symbol: string; value: T }, void, void> {
    let pageToken: string | undefined = undefined;
    do {
        const page = await fetchPage(pageToken);
        const data = page.data ?? {};
        for (const symbol of Object.keys(data)) {
            for (const value of data[symbol] ?? []) {
                yield { symbol, value };
            }
        }
        pageToken = page.nextPageToken ? page.nextPageToken : undefined;
    } while (pageToken);
}

/**
 * Eagerly collects a symbol-keyed response into a single merged
 * `{ [symbol]: T[] }` map, concatenating each symbol's arrays across pages.
 * Beware unbounded result sets.
 */
export async function collectBySymbol<T>(
    fetchPage: SymbolMapPageFetcher<T>,
): Promise<{ [symbol: string]: T[] }> {
    const out: { [symbol: string]: T[] } = {};
    let pageToken: string | undefined = undefined;
    do {
        const page = await fetchPage(pageToken);
        const data = page.data ?? {};
        for (const symbol of Object.keys(data)) {
            (out[symbol] ??= []).push(...(data[symbol] ?? []));
        }
        pageToken = page.nextPageToken ? page.nextPageToken : undefined;
    } while (pageToken);
    return out;
}

// --- Symbol-keyed single-object pagination --------------------------------
//
// A couple of endpoints (`optionSnapshots`, `optionChain`) return a symbol map
// whose values are single objects, not arrays: `{ [symbol]: OptionSnapshot }`.
// Pages are merged by symbol (later pages fill in / overwrite earlier ones).

/** A page whose payload is a `{ [symbol]: T }` map plus an optional token. */
export interface SymbolObjectPage<T> {
    /** Per-symbol object for this page. */
    data: { [symbol: string]: T };
    /** Token for the next page; `null`/`undefined`/`""` means no more pages. */
    nextPageToken?: string | null;
}

/** Fetches a single `{ [symbol]: T }` page given an optional page token. */
export type SymbolObjectPageFetcher<T> = (pageToken?: string) => Promise<SymbolObjectPage<T>>;

/** Lazily yields every `{ symbol, value }` entry across all pages. */
export async function* paginateSymbolObjects<T>(
    fetchPage: SymbolObjectPageFetcher<T>,
): AsyncGenerator<{ symbol: string; value: T }, void, void> {
    let pageToken: string | undefined = undefined;
    do {
        const page = await fetchPage(pageToken);
        const data = page.data ?? {};
        for (const symbol of Object.keys(data)) {
            yield { symbol, value: data[symbol] };
        }
        pageToken = page.nextPageToken ? page.nextPageToken : undefined;
    } while (pageToken);
}

/**
 * Eagerly collects a symbol-keyed single-object response into one merged
 * `{ [symbol]: T }` map; later pages overwrite earlier values for a symbol.
 */
export async function collectSymbolObjects<T>(
    fetchPage: SymbolObjectPageFetcher<T>,
): Promise<{ [symbol: string]: T }> {
    const out: { [symbol: string]: T } = {};
    let pageToken: string | undefined = undefined;
    do {
        const page = await fetchPage(pageToken);
        const data = page.data ?? {};
        for (const symbol of Object.keys(data)) {
            out[symbol] = data[symbol];
        }
        pageToken = page.nextPageToken ? page.nextPageToken : undefined;
    } while (pageToken);
    return out;
}

// --- Cursor pagination -----------------------------------------------------
//
// Account activities return a bare `T[]` with no envelope or token. The next
// page is requested by passing `page_token` = the `id` of the last item on the
// current page. Iteration stops on an empty page, on a short page (when
// `pageSize` is known), or when the last item has no usable cursor.

/** Options controlling cursor-based pagination. */
export interface CursorOptions<T> {
    /** Fetches a single page given an optional cursor token. */
    fetchPage: (pageToken?: string) => Promise<T[]>;
    /** Extracts the cursor (next `page_token`) from the last item of a page. */
    getCursor: (lastItem: T) => string | null | undefined;
    /** Page size, if requested; used to detect the final (short) page. */
    pageSize?: number;
}

/** Lazily yields every item across all cursor pages. */
export async function* paginateCursor<T>(
    options: CursorOptions<T>,
): AsyncGenerator<T, void, void> {
    const { fetchPage, getCursor, pageSize } = options;
    let pageToken: string | undefined = undefined;
    for (;;) {
        const page = await fetchPage(pageToken);
        if (!page || page.length === 0) {
            return;
        }
        for (const item of page) {
            yield item;
        }
        if (pageSize != null && page.length < pageSize) {
            return;
        }
        const cursor = getCursor(page[page.length - 1]);
        if (!cursor) {
            return;
        }
        pageToken = cursor;
    }
}

/** Eagerly collects every item across all cursor pages into a single array. */
export async function collectCursor<T>(options: CursorOptions<T>): Promise<T[]> {
    const out: T[] = [];
    for await (const item of paginateCursor(options)) {
        out.push(item);
    }
    return out;
}
