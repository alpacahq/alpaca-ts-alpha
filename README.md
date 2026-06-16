# @alpacahq/alpaca-ts-alpha

A single Node.js TypeScript SDK for the Alpaca **Trading API** and **Market Data
API**. Both APIs live under their own namespace (`trading` / `marketData`) in one
package, fronted by a unified `Alpaca` client with typed errors, resilience
(retry / timeout / rate limiting), pagination helpers, ergonomic order builders,
and real-time streaming.

## Requirements

- **Node.js** >= 20 (developed against v24) — the REST transport uses the
  platform-global `fetch`, `Headers`, `URL`, and `AbortController`. (Node 18
  reached end-of-life in April 2025; the package declares `engines.node >=20`.)

## Install

```bash
npm install @alpacahq/alpaca-ts-alpha
```

_(Not yet published — `version` is `0.0.0`.)_

## Quick start: the `Alpaca` client

The SDK ships ~16 trading and ~11 market-data `Api` classes. The `Alpaca` client
bundles all of them (plus the real-time streams) behind a single constructor:
pass credentials once and reach everything through the `.trading` and
`.marketData` namespaces. Sub-APIs are created lazily and memoized.

```ts
import { Alpaca } from "@alpacahq/alpaca-ts-alpha";

const alpaca = new Alpaca({
  keyId: process.env.APCA_KEY_ID!,
  secret: process.env.APCA_SECRET!,
  paper: true, // default; set false for live trading
});

// REST — no manual Configuration / Api wiring
const account = await alpaca.trading.account.getAccount();
const positions = await alpaca.trading.positions.getAllOpenPositions();

// Ergonomic order placement (see "Placing orders")
await alpaca.trading.orders.market({ symbol: "AAPL", qty: 1, side: "buy" });

// Streaming — shares the same credentials and paper/live setting
const bars = alpaca.marketData.stockStream({ feed: "iex" });
bars.onBar((b) => console.log(b.symbol, b.close));
bars.onConnect(() => bars.subscribeForBars(["AAPL", "MSFT"]));
bars.connect();
```

The `paper` flag controls the trading REST host (`paper-api` vs `api`) and the
default trading-updates stream endpoint; market data always uses
`data.alpaca.markets`. The `trading` / `marketData` namespaces remain available
if you prefer to construct `Api` classes yourself:

```ts
import { trading, marketData } from "@alpacahq/alpaca-ts-alpha";

const orders = new trading.OrdersApi(new trading.Configuration({ keyId, secret }));
const stocks = new marketData.StockApi(new marketData.Configuration({ keyId, secret }));
```

## How the facade is organized

The `Alpaca` client is **two layers**, and knowing the rule is the whole mental
model:

1. **Generated (always present, uniform).** Every generated REST method is
   reachable raw at `alpaca.<group>.<resource>.<method>(...)` — e.g.
   `alpaca.trading.assets.getV2Assets()` or `alpaca.marketData.stocks.stockBars(...)`.
   Nothing is ever hidden or removed.
2. **Ergonomic (additive, never replaces layer 1).** A curated set of
   hand-written conveniences sits on top: order builders, normalized
   market-data accessors, pagination, and workflow helpers. They are *additions*
   — the raw method each one builds on is still there.

So the rule you can rely on: **if there's no ergonomic helper for what you need,
the raw generated method is always available.** You never have to guess whether
a resource is "ergonomic" or "raw" — it's both.

Three maps make this queryable (each also has a lookup):

| Layer | Map | Lookup |
| --- | --- | --- |
| Generated methods | `capabilities` | `findCapabilities("getAccount")` |
| Ergonomic helpers | `ergonomicCapabilities` | `findErgonomic("market")` |
| Real-time streams | `streamingCapabilities` | — |

The ergonomic layer follows predictable naming conventions, so helpers are
guessable:

- **Order builders:** one verb method per kind on `trading.orders` (`market`,
  `limit`, `stop`, `stopLimit`, `trailingStop`, `bracket`, `oco`, `oto`), plus a
  generic `submit` escape hatch.
- **Normalized REST:** `get<Asset><Thing>` returns canonical, symbol-keyed
  shapes (`getStockBars`, `getCryptoTrades`, ...); `get<Asset>Candles` returns
  the chart-ready columnar form.
- **Pagination:** `iterate<X>` lazily yields across pages; `collect<X>` /
  `collect<X>BySymbol` eagerly returns them.
- **Workflow:** verb-named one-offs (`submitAndWait`, `closeAllPositions`,
  `getLatestPrice`).

## Authentication

Alpaca authenticates with two distinct headers (`APCA-API-KEY-ID` and
`APCA-API-SECRET-KEY`). Pass `keyId` and `secret` directly.

```ts
const alpaca = new Alpaca({ keyId, secret });
```

> Do **not** pass `apiKey` as a plain string — it would send the same value for
> both headers and Alpaca would reject it. The SDK throws a guided error if you
> try. To compute credentials lazily (e.g. from a vault), use the helper:
>
> ```ts
> import { trading, auth } from "@alpacahq/alpaca-ts-alpha";
> const config = new trading.Configuration({ apiKey: auth.apiKeyAuth({ keyId, secret }) });
> ```

## Paper vs live

Trading defaults to **paper**. Switching to live is a deliberate flag, never an
accidental missing host:

```ts
const live = new Alpaca({ keyId, secret, paper: false });
```

Named hosts are exported too: `trading.TRADING_PAPER_HOST`,
`trading.TRADING_LIVE_HOST`, `marketData.MARKET_DATA_HOST`.

## Resilience & configuration

All options below are optional and conservative by default. On the `Alpaca`
client they are passed at the top level; on a raw `Configuration` they are
identical fields.

```ts
const alpaca = new Alpaca({
  keyId,
  secret,

  // Abort a stalled request after N ms (default: no timeout).
  timeoutMs: 10_000,

  // Opt-in automatic retry. Disabled unless maxRetries > 0.
  retry: {
    maxRetries: 3,
    retryDelayMs: 500,        // base for exponential backoff (default 500)
    maxDelayMs: 30_000,       // cap per delay (default 30000)
    retryableStatuses: [429, 500, 502, 503, 504], // default
    respectRetryAfter: true,  // honor a Retry-After header (default true)
  },

  // Proactive client-side rate limiting (the Alpaca client enables a safe
  // default; pass a config to tune or `false` to disable). See below.
  rateLimit: { maxRequests: 200, intervalMs: 60_000, maxConcurrent: 16 },

  userAgent: "my-app/1.0", // default `@alpacahq/alpaca-ts-alpha/<version>`; "" disables
});
```

### Retry semantics

- Off unless `retry.maxRetries > 0`.
- `429` is always retried; the `retryableStatuses` (5xx by default) are retried
  **only for idempotent verbs** (`GET/HEAD/PUT/DELETE/OPTIONS`), so a
  non-idempotent `POST` is never silently re-sent.
- **Transient network failures** (DNS, connection reset, TLS — surfaced as a
  `FetchError`) are also retried, again **only for idempotent verbs**. A
  deliberate abort (caller `AbortSignal` or the `timeoutMs` deadline) is *not*
  retried.
- A `Retry-After` header (seconds or HTTP-date) is honored when present;
  otherwise exponential backoff with jitter, capped at `maxDelayMs`.

### Timeouts

`timeoutMs` wires an `AbortController` into the underlying `fetch`. A per-call
`AbortSignal` (passed via `initOverrides`) still works and composes with the
timeout — whichever aborts first wins.

### Rate limiting

Alpaca enforces roughly 200 requests/minute per host. The `Alpaca` client
enables a safe default token bucket (~200/min, applied independently to the
trading and market-data hosts) so burst workloads self-throttle instead of
tripping 429s. Tune it with a `rateLimit` config or pass `rateLimit: false` to
opt out. When constructing raw `Api` classes the limiter is **off** unless you
set `rateLimit` on the `Configuration`.

### Typed errors

Non-2xx responses reject with an `ApiError` (a `ResponseError` subclass) exposing
`status`, `code`, and `message` parsed from Alpaca's `{ code, message }` error
envelope; the raw `Response` stays on `.response`. Branch on the status-specific
subclasses instead of magic numbers:

```ts
import { RateLimitError, NotFoundError, ApiError } from "@alpacahq/alpaca-ts-alpha";

try {
  await alpaca.trading.orders.getOrderByOrderID({ orderId });
} catch (err) {
  if (err instanceof RateLimitError) {
    console.warn(`rate limited; retry in ${err.retryAfterMs}ms`, err.rateLimit);
  } else if (err instanceof NotFoundError) {
    console.warn("no such order");
  } else if (err instanceof ApiError) {
    console.error(err.status, err.code, err.message);
  }
}
```

Subclasses: `AuthError` (401), `PermissionError` (403), `NotFoundError` (404),
`ValidationError` (400/422), `RateLimitError` (429). Every `ApiError` also
surfaces `rateLimit` (`X-RateLimit-*`), `retryAfterMs`, and `requestId` —
Alpaca's `X-Request-ID` for the failed call. That id can't be looked up after
the fact, so log it (or include it in a support ticket) when something fails:

```ts
catch (err) {
  if (err instanceof ApiError) {
    console.error(`request ${err.requestId} failed`, err.status, err.message);
  }
}
```

A failed `fetch` itself (network/abort) rejects with `FetchError`.

## Placing orders

`alpaca.trading.orders` is the generated `OrdersApi` plus one ergonomic method
per common order kind that drops the `postOrder({ postOrderRequest })` wrapper,
accepts `number | string` amounts, and enforces the required fields per kind at
compile time. Each returns the created `Order`; `timeInForce` defaults to
`"day"`.

```ts
await alpaca.trading.orders.market({ symbol: "AAPL", qty: 1, side: "buy" });
await alpaca.trading.orders.limit({ symbol: "AAPL", qty: 1, side: "buy", limitPrice: 150 });
await alpaca.trading.orders.stop({ symbol: "AAPL", qty: 1, side: "sell", stopPrice: 140 });
await alpaca.trading.orders.stopLimit({ symbol: "AAPL", qty: 1, side: "sell", stopPrice: 140, limitPrice: 139.5 });
await alpaca.trading.orders.trailingStop({ symbol: "AAPL", qty: 1, side: "sell", trailPercent: 5 });

await alpaca.trading.orders.bracket({
  symbol: "AAPL", qty: 10, side: "buy", limitPrice: 150,
  takeProfit: { limitPrice: 155 },
  stopLoss: { stopPrice: 145, limitPrice: 144.5 },
});
```

For shapes the typed methods don't cover (e.g. multi-leg `mleg`), use
`alpaca.trading.orders.submit(input)` or the raw `postOrder`. The pure builders
are also exported under the `orders` namespace.

## Workflow helpers

A few high-level flows that would otherwise be boilerplate:

```ts
// Latest trade price as a number (undefined if unavailable).
const price = await alpaca.marketData.getLatestPrice("AAPL");

// Close every open position (optionally cancelling open orders first).
await alpaca.trading.closeAllPositions({ cancelOrders: true });

// Place an order and await its terminal state over the trading-updates stream
// (resolves on fill/canceled/rejected/expired/done_for_day; rejects on timeout).
const filled = await alpaca.trading.submitAndWait(
  { type: "market", symbol: "AAPL", qty: 1, side: "buy" },
  { timeoutMs: 30_000 },
);
console.log(filled.status, filled.filledAvgPrice);
```

## Pagination

Every paginated endpoint is iterable out of the box on the `Alpaca` client — you
never thread page tokens or merge per-symbol arrays. `iterate*` lazily yields
items across all pages; `collect*` eagerly returns them.

```ts
for await (const { symbol, value } of alpaca.marketData.iterateStockBars({
  symbols: ["AAPL", "MSFT"],
  timeframe: TimeFrame.Day,
  start: new Date("2024-01-01"),
})) {
  // value is a StockBar for symbol
}

const bars = await alpaca.marketData.collectStockBarsBySymbol({
  symbols: "AAPL,MSFT",
  timeframe: TimeFrame.Day,
  start: new Date("2024-01-01"),
});
bars.AAPL; // StockBar[]

const articles = await alpaca.marketData.collectNews({ symbols: "AAPL" });

for await (const activity of alpaca.trading.iterateActivities({ activityTypes: ["FILL"] })) {
  // ...
}
```

The same pattern exists for stock/crypto/option trades, quotes, bars and
auctions, `indexValues`, forex `rates`, option `snapshots`/`chain`,
`iterateOptionsContracts`, and `collectCorporateActions`. For custom cases the
lower-level `pagination` namespace exposes the building blocks: `paginate`/
`collect`, `paginateSymbolMap`/`collectBySymbol`, `paginateSymbolObjects`/
`collectSymbolObjects`, and `paginateCursor`/`collectCursor`.

### Bounding large fetches

A multi-symbol `collect*BySymbol` (and the normalized `get*` accessors) accept a
`SymbolCollectOptions` to keep big back-fills cheap. By default every symbol is
multiplexed into one request whose page token is followed to exhaustion; pass
options to bound memory and parallelize:

```ts
// Cap each symbol's history (stops paging once every symbol is full).
const recent = await alpaca.marketData.getStockBars(
  { symbols: ["AAPL", "MSFT"], timeframe: TimeFrame.Minute, start },
  { maxPerSymbol: 1_000 },
);

// Fetch a large basket in parallel: split into one request per symbol,
// up to 4 in flight. The client-side rate limiter still applies.
const basket = await alpaca.marketData.getStockBars(
  { symbols: bigList, timeframe: TimeFrame.Day, start },
  { concurrency: 4, chunkSize: 1, maxPerSymbol: 5_000 },
);
```

`concurrency` defaults to `1` (the single combined request); `chunkSize`
(default `1`) controls how many symbols share each parallel request. The generic
`pagination.collect`/`collectCursor` take a `maxItems` cap, and
`pagination.collectBySymbol` takes `maxPerSymbol`; `pagination.mapConcurrent` and
`pagination.chunk` are exposed for custom fan-out.

## Values & types

Money/quantities are wire-truthful numeric `string`s (no float64 precision
loss). Parse or format with the `values` helpers; for exact arithmetic keep the
string and feed a decimal library (`big.js`/`decimal.js`, not bundled).

```ts
import { values } from "@alpacahq/alpaca-ts-alpha";

values.toNumber(account.buyingPower);          // number | undefined
values.toNumberOr(account.cash, 0);            // number with fallback
values.formatMoney(account.equity);            // "$12,345.67" (display only)
```

Build timeframes with the validated builders instead of hand-writing strings
like `"1minute"` (which the API rejects); the facade bar methods require the
branded `TimeFrameString` these return:

```ts
import { TimeFrame, TimeFrameUnit, timeFrame } from "@alpacahq/alpaca-ts-alpha";

timeFrame(15, TimeFrameUnit.Minute); // "15Min"
TimeFrame.Day;                       // preset "1Day"
```

Multi-symbol market-data methods accept a comma-separated `string` or a
`string[]`. Time fields: trading models parse timestamps to `Date`, and
market-data models also **type** them as `Date`. Note that the multi-symbol/list
responses deserialize their symbol-keyed maps verbatim, so nested timestamps can
still arrive as ISO `string`s at runtime despite that type; the normalized
`marketDataShapes` accessors below always hand back real `Date`s, and for raw
responses you can normalize with `values.toDate` / `values.toISO`.

## Normalized market-data shapes (REST + streaming unified)

The generated REST models keep Alpaca's compact wire keys (`StockBar` is
`{ o, h, l, c, v, vw, n, t }`), while the real-time stream surfaces readable
camelCase. The `marketDataShapes` namespace bridges them onto one canonical
`Bar` / `Trade` / `Quote` shape — the *same* type the streaming clients emit —
so you can backfill history over REST and append live updates over the
WebSocket without reconciling two shapes.

The `Alpaca` client exposes normalized accessors (auto-paginated, keyed by
symbol) alongside the raw `collect*`/`iterate*` ones:

```ts
import { Alpaca, marketDataShapes, TimeFrame } from "@alpacahq/alpaca-ts-alpha";

const alpaca = new Alpaca({ keyId, secret });

// REST history as canonical Bars: { [symbol]: Bar[] }
const history = await alpaca.marketData.getStockBars({
  symbols: ["AAPL"], timeframe: TimeFrame.Day, start: new Date("2024-01-01"),
});

// Live bars arrive in the SAME shape - just append them.
const stream = alpaca.marketData.stockStream({ feed: "iex" });
stream.onBar((bar) => history.AAPL?.push(bar)); // bar is a Bar
stream.onConnect(() => stream.subscribeForBars(["AAPL"]));
stream.connect();
```

Normalized accessors: `getStockBars`/`getCryptoBars`/`getOptionBars`,
`getStockTrades`/`getCryptoTrades`, `getStockQuotes`/`getCryptoQuotes`, and the
chart-ready `getStockCandles`/`getCryptoCandles`. For any other endpoint, the
pure mappers normalize a raw response yourself: `marketDataShapes.toBar`,
`toStockTrade`/`toCryptoTrade`/`toOptionTrade`,
`toStockQuote`/`toCryptoQuote`/`toOptionQuote`, and the `*BySymbol` helpers.

### Chart-ready helpers

Reshape a `Bar[]` into the forms plotting libraries expect:

```ts
import { toCandles, toCandlestickSeries, toLineSeries } from "@alpacahq/alpaca-ts-alpha";

toCandles(history.AAPL);              // { time[], open[], high[], low[], close[], volume[] }
toCandles(history.AAPL, { time: "seconds" }); // unix seconds instead of epoch ms
toCandlestickSeries(history.AAPL);    // [{ time, open, high, low, close }]
toLineSeries(history.AAPL, "close");  // [{ time, value }]
```

These live in the `marketDataShapes` namespace too and are re-exported at the top
level. Everything here is REST-only (no `ws`/`msgpack`), so it is available from
the `@alpacahq/alpaca-ts-alpha/rest` entrypoint as well.

## Real-time streaming

WebSocket clients for a market-data stream (stocks, crypto, options, news) and a
trading stream (order/account updates). Both authenticate automatically,
reconnect with backoff, re-subscribe after a reconnect, and ping/pong. The API
is a typed `EventEmitter`: register listeners, then `connect()`.

```ts
const stocks = alpaca.marketData.stockStream({ feed: "iex" }); // "iex" | "sip" | "delayed_sip"
stocks.onBar((bar) => pushToClients(bar)); // typed StreamBar
stocks.onError((msg) => console.error("stream error:", msg));
stocks.onConnect(() => stocks.subscribeForBars(["AAPL", "MSFT"]));
stocks.connect();

const updates = alpaca.trading.stream();
updates.onTradeUpdate((u) => console.log(u.event, u.order.symbol, u.order.clientOrderId));
updates.onConnect(() => updates.subscribeTradeUpdates());
updates.connect();
```

`cryptoStream()`, `optionStream()`, and `newsStream()` share the same surface.

## Capability map (which method lives where)

The `capabilities` namespace maps each **generated** facade accessor to its
underlying `Api` class and common methods; `findCapabilities(name)` answers
"where does this method live?":

```ts
import { capabilities, findCapabilities } from "@alpacahq/alpaca-ts-alpha";

findCapabilities("getAccount");
// [{ accessor: "trading.account", api: "AccountsApi", group: "trading", ... }]
```

The **ergonomic** (layer 2) helpers have their own map, `ergonomicCapabilities`,
with a matching `findErgonomic(name)` lookup — so "is there a helper for this,
and where?" is answerable the same way:

```ts
import { ergonomicCapabilities, findErgonomic } from "@alpacahq/alpaca-ts-alpha";

findErgonomic("market");
// [{ accessor: "trading.orders", kind: "orderBuilder", wraps: "OrdersApi.postOrder", ... }]
findErgonomic("getStockBars");
// [{ accessor: "marketData", kind: "normalized", ... }]
```

## Observability

Built-in middleware for logging and metrics, layered on the transport's
`pre`/`post`/`onError` hooks. Pass them via `middleware`; they observe only
(never alter the request), so they compose with retries and with each other.

```ts
import { Alpaca, middleware } from "@alpacahq/alpaca-ts-alpha";

const alpaca = new Alpaca({
  keyId,
  secret,
  middleware: [
    // One log line per request attempt: method, url, status, duration, requestId.
    middleware.loggingMiddleware({ logger: console, level: "info" }),
    // A metric per request attempt for Prometheus / StatsD / OpenTelemetry.
    middleware.metricsMiddleware({
      onRequest: (m) =>
        statsd.timing("alpaca.request", m.durationMs, { method: m.method, status: m.status }),
    }),
  ],
});
```

`loggingMiddleware` redacts the `APCA-*` and `Authorization` headers by default
(and only includes headers at all when `logHeaders: true`). Both accept a
`genRequestId` to supply your own correlation ids.

## Dependencies

The REST client needs nothing beyond the Node platform globals. The **streaming**
clients (WebSockets) pull in two small runtime dependencies — [`ws`](https://github.com/websockets/ws)
and [`@msgpack/msgpack`](https://github.com/msgpack/msgpack-javascript) — which
are only loaded when you actually open a stream. If you only use REST, import
from the [`@alpacahq/alpaca-ts-alpha/rest`](#rest-only-entrypoint) subpath and they are never
loaded.

## REST-only entrypoint

If you never open a stream, import from `@alpacahq/alpaca-ts-alpha/rest` to keep the `ws` /
`@msgpack/msgpack` dependencies out of your module graph (smaller bundles,
faster cold starts). It re-exports everything except the `streaming` namespace.
The `Alpaca` facade is the same class, so all REST methods work unchanged; the
stream factories (`stockStream`, `stream`, ...) and `submitAndWait` throw if
called from this entrypoint — import from `@alpacahq/alpaca-ts-alpha` when you need streams.

```ts
import { Alpaca } from "@alpacahq/alpaca-ts-alpha/rest";
```

## Testing your integration

`@alpacahq/alpaca-ts-alpha/testing` provides a network-free harness so your unit tests don't
hit Alpaca. `mockFetch` answers canned responses by method + path; `createMockAlpaca`
wires one into a ready `Alpaca` client (dummy credentials, rate limiting off).

```ts
import { createMockAlpaca } from "@alpacahq/alpaca-ts-alpha/testing";

const alpaca = createMockAlpaca([
  { method: "GET", path: "/v2/account", body: { account_number: "PA42", status: "ACTIVE" } },
  { path: /\/v2\/stocks\/[A-Z]+\/trades\/latest$/, respond: ({ url }) => ({
      symbol: url.pathname.split("/")[3],
      trade: { p: 99.5 },
    }) },
]);

const account = await alpaca.trading.account.getAccount(); // { accountNumber: "PA42", ... }
const price = await alpaca.marketData.getLatestPrice("AAPL"); // 99.5
```

Routes match the first entry whose `path` (exact string or RegExp) and optional
`method` match; unmatched requests get your `fallback` or a descriptive 404. A
route's `body` is JSON-encoded automatically (objects) or sent verbatim
(strings); `respond` is the dynamic escape hatch.

## Module formats (ESM & CJS)

The package ships both native ESM (`dist/index.mjs`) and CommonJS
(`dist/index.js`), selected via conditional `exports`, with per-format type
declarations and `sideEffects: false` for tree-shaking.

```ts
import { Alpaca } from "@alpacahq/alpaca-ts-alpha";       // ESM
```
```js
const { Alpaca } = require("@alpacahq/alpaca-ts-alpha");  // CJS
```

> Dual-package caveat: don't load the SDK through *both* `import` and `require`
> in the same process if you rely on `instanceof` against its exported classes
> (e.g. `ApiError`), or you may compare against two copies.

## Development

```bash
npm install      # also builds via the `prepare` script
npm run build    # tsup (esbuild) -> dual ESM+CJS + types in dist/
npm run typecheck # tsc --noEmit (type authority; does not emit)
npm test         # vitest
```

`dist/` is git-ignored and produced by the build (and automatically on
`npm publish` / `npm pack` via `prepare`). Runnable end-to-end examples live in
[`examples/`](./examples).

## Background

- **One package, two namespaces.** The Trading and Market Data APIs are exposed
  as the `trading` and `marketData` namespaces of a single package. This avoids
  collisions between the two specs, which both define a `CorporateActionsApi`
  and overlapping model names.

