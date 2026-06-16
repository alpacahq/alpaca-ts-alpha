import { describe, it, expect } from 'vitest';

import {
    collect,
    collectBySymbol,
    collectCursor,
    collectSymbolObjects,
    paginate,
    paginateCursor,
    paginateSymbolMap,
    paginateSymbolObjects,
    type Page,
    type SymbolMapPage,
    type SymbolObjectPage,
} from '../src/pagination';

describe('G04 pagination helpers', () => {
    const threePages: Record<string, Page<number>> = {
        '': { items: [1, 2], nextPageToken: 'p2' },
        p2: { items: [3, 4], nextPageToken: 'p3' },
        p3: { items: [5], nextPageToken: null },
    };

    it('collect() follows nextPageToken until exhausted', async () => {
        const all = await collect<number>(async (token) => threePages[token ?? '']);
        expect(all).toEqual([1, 2, 3, 4, 5]);
    });

    it('paginate() passes the correct token to each fetch and visits pages in order', async () => {
        const seenTokens: Array<string | undefined> = [];
        const out: number[] = [];
        for await (const item of paginate<number>(async (token) => {
            seenTokens.push(token);
            return threePages[token ?? ''];
        })) {
            out.push(item);
        }
        expect(out).toEqual([1, 2, 3, 4, 5]);
        expect(seenTokens).toEqual([undefined, 'p2', 'p3']);
    });

    it('paginate() yields lazily and stops fetching on early break', async () => {
        let fetches = 0;
        const out: number[] = [];
        for await (const item of paginate<number>(async (token) => {
            fetches += 1;
            return threePages[token ?? ''];
        })) {
            out.push(item);
            if (out.length === 3) break;
        }
        expect(out).toEqual([1, 2, 3]);
        expect(fetches).toBe(2); // only the first two pages were fetched
    });

    it('handles a single page with no next token', async () => {
        const all = await collect<number>(async () => ({ items: [42], nextPageToken: undefined }));
        expect(all).toEqual([42]);
    });

    it('treats an empty-string next token as terminal', async () => {
        const all = await collect<number>(async () => ({ items: [7], nextPageToken: '' }));
        expect(all).toEqual([7]);
    });

    it('continues past an empty page that still carries a next token', async () => {
        const pages: Record<string, Page<number>> = {
            '': { items: [], nextPageToken: 'p2' },
            p2: { items: [9], nextPageToken: null },
        };
        const all = await collect<number>(async (token) => pages[token ?? '']);
        expect(all).toEqual([9]);
    });

    it('tolerates a nullish items array without throwing', async () => {
        const all = await collect<number>(async () => ({ items: undefined as unknown as number[], nextPageToken: null }));
        expect(all).toEqual([]);
    });
});

describe('symbol-map pagination', () => {
    const pages: Record<string, SymbolMapPage<number>> = {
        '': { data: { AAPL: [1, 2], MSFT: [10] }, nextPageToken: 'p2' },
        p2: { data: { AAPL: [3], MSFT: [11, 12] }, nextPageToken: null },
    };

    it('paginateSymbolMap yields flat { symbol, value } across symbols and pages', async () => {
        const out: Array<{ symbol: string; value: number }> = [];
        for await (const rec of paginateSymbolMap<number>(async (token) => pages[token ?? ''])) {
            out.push(rec);
        }
        expect(out).toEqual([
            { symbol: 'AAPL', value: 1 },
            { symbol: 'AAPL', value: 2 },
            { symbol: 'MSFT', value: 10 },
            { symbol: 'AAPL', value: 3 },
            { symbol: 'MSFT', value: 11 },
            { symbol: 'MSFT', value: 12 },
        ]);
    });

    it('collectBySymbol concatenates each symbol across pages', async () => {
        const merged = await collectBySymbol<number>(async (token) => pages[token ?? '']);
        expect(merged).toEqual({ AAPL: [1, 2, 3], MSFT: [10, 11, 12] });
    });

    it('threads the page token and stops on a null token', async () => {
        const seen: Array<string | undefined> = [];
        await collectBySymbol<number>(async (token) => {
            seen.push(token);
            return pages[token ?? ''];
        });
        expect(seen).toEqual([undefined, 'p2']);
    });

    it('tolerates nullish data without throwing', async () => {
        const merged = await collectBySymbol<number>(async () => ({
            data: undefined as unknown as Record<string, number[]>,
            nextPageToken: null,
        }));
        expect(merged).toEqual({});
    });
});

describe('symbol-object pagination', () => {
    const pages: Record<string, SymbolObjectPage<{ v: number }>> = {
        '': { data: { AAPL: { v: 1 }, MSFT: { v: 2 } }, nextPageToken: 'p2' },
        p2: { data: { AAPL: { v: 9 }, TSLA: { v: 3 } }, nextPageToken: null },
    };

    it('paginateSymbolObjects yields one { symbol, value } per entry', async () => {
        const out: Array<{ symbol: string; value: { v: number } }> = [];
        for await (const rec of paginateSymbolObjects<{ v: number }>(async (token) => pages[token ?? ''])) {
            out.push(rec);
        }
        expect(out).toEqual([
            { symbol: 'AAPL', value: { v: 1 } },
            { symbol: 'MSFT', value: { v: 2 } },
            { symbol: 'AAPL', value: { v: 9 } },
            { symbol: 'TSLA', value: { v: 3 } },
        ]);
    });

    it('collectSymbolObjects merges by symbol, later pages overwriting', async () => {
        const merged = await collectSymbolObjects<{ v: number }>(async (token) => pages[token ?? '']);
        expect(merged).toEqual({ AAPL: { v: 9 }, MSFT: { v: 2 }, TSLA: { v: 3 } });
    });
});

describe('cursor pagination', () => {
    interface Item { id: string; n: number; }

    it('threads the last id as the next token and stops on an empty page', async () => {
        const byToken: Record<string, Item[]> = {
            '': [{ id: 'a', n: 1 }, { id: 'b', n: 2 }],
            b: [{ id: 'c', n: 3 }],
            c: [],
        };
        const seen: Array<string | undefined> = [];
        const out = await collectCursor<Item>({
            fetchPage: (token) => {
                seen.push(token);
                return Promise.resolve(byToken[token ?? '']);
            },
            getCursor: (last) => last.id,
        });
        expect(out.map((i) => i.n)).toEqual([1, 2, 3]);
        expect(seen).toEqual([undefined, 'b', 'c']);
    });

    it('stops on a short page when pageSize is known (no extra fetch)', async () => {
        let fetches = 0;
        const byToken: Record<string, Item[]> = {
            '': [{ id: 'a', n: 1 }, { id: 'b', n: 2 }],
            b: [{ id: 'c', n: 3 }], // shorter than pageSize -> terminal
        };
        const out = await collectCursor<Item>({
            fetchPage: (token) => {
                fetches += 1;
                return Promise.resolve(byToken[token ?? '']);
            },
            getCursor: (last) => last.id,
            pageSize: 2,
        });
        expect(out.map((i) => i.n)).toEqual([1, 2, 3]);
        expect(fetches).toBe(2);
    });

    it('stops when the cursor is nullish', async () => {
        const out = await collectCursor<Item>({
            fetchPage: () => Promise.resolve([{ id: '', n: 1 }]),
            getCursor: (last) => last.id,
        });
        expect(out).toEqual([{ id: '', n: 1 }]);
    });

    it('paginateCursor yields lazily and stops fetching on early break', async () => {
        let fetches = 0;
        const byToken: Record<string, Item[]> = {
            '': [{ id: 'a', n: 1 }, { id: 'b', n: 2 }],
            b: [{ id: 'c', n: 3 }],
            c: [],
        };
        const out: number[] = [];
        for await (const item of paginateCursor<Item>({
            fetchPage: (token) => {
                fetches += 1;
                return Promise.resolve(byToken[token ?? '']);
            },
            getCursor: (last) => last.id,
        })) {
            out.push(item.n);
            if (out.length === 2) break;
        }
        expect(out).toEqual([1, 2]);
        expect(fetches).toBe(1);
    });
});
