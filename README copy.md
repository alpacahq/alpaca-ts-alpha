# @alpaca/sdk

A single Node.js TypeScript SDK for the Alpaca **Trading API** and **Market Data
API**. Both APIs live under their own namespace (`trading` / `marketData`) in one
package, fronted by a unified `Alpaca` client with typed errors, resilience
(retry / timeout / rate limiting), pagination helpers, ergonomic order builders,
and real-time streaming.

## Requirements

- **Node.js** >= 18 (developed against v24) — the REST transport uses the
  platform-global `fetch`, `Headers`, `URL`, and `AbortController`.

## Install

```bash
npm install @alpaca/sdk
```

_(Not yet published — `version` is `0.0.0`.)_

## Quick start: the `Alpaca` client

The SDK ships ~16 trading and ~11 market-data `Api` classes. The `Alpaca` client
bundles all of them (plus the real-time streams) behind a single constructor:
pass credentials once and reach everything through the `.trading` and
`.marketData` namespaces. Sub-APIs are created lazily and memoized.

```ts
import { Alpaca } from "@alpaca/sdk";

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
import { trading, marketData } from "@alpaca/sdk";

const orders = new trading.OrdersApi(new trading.Configuration({ keyId, secret }));
const stocks = new marketData.StockApi(new marketData.Configuration({ keyId, secret }));
```

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
> import { trading, auth } from "@alpaca/sdk";
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

  userAgent: "my-app/1.0", // default `@alpaca/sdk/<version>`; "" disables
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
import { RateLimitError, NotFoundError, ApiError } from "@alpaca/sdk";

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
surfaces `rateLimit` (`X-RateLimit-*`) and `retryAfterMs`. A failed `fetch`
itself (network/abort) rejects with `FetchError`.

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

## Values & types

Money/quantities are wire-truthful numeric `string`s (no float64 precision
loss). Parse or format with the `values` helpers; for exact arithmetic keep the
string and feed a decimal library (`big.js`/`decimal.js`, not bundled).

```ts
import { values } from "@alpaca/sdk";

values.toNumber(account.buyingPower);          // number | undefined
values.toNumberOr(account.cash, 0);            // number with fallback
values.formatMoney(account.equity);            // "$12,345.67" (display only)
```

Build timeframes with the validated builders instead of hand-writing strings
like `"1minute"` (which the API rejects); the facade bar methods require the
branded `TimeFrameString` these return:

```ts
import { TimeFrame, TimeFrameUnit, timeFrame } from "@alpaca/sdk";

timeFrame(15, TimeFrameUnit.Minute); // "15Min"
TimeFrame.Day;                       // preset "1Day"
```

Multi-symbol market-data methods accept a comma-separated `string` or a
`string[]`. Time fields are mixed (trading models parse to `Date`; market-data
timestamps stay `string`); normalize with `values.toDate` / `values.toISO`.

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

The `capabilities` namespace maps each facade accessor to its underlying `Api`
class and common methods; `findCapabilities(name)` answers "where does this
method live?":

```ts
import { capabilities, findCapabilities } from "@alpaca/sdk";

findCapabilities("getAccount");
// [{ accessor: "trading.account", api: "AccountsApi", group: "trading", ... }]
```

## Observability

Built-in middleware for logging and metrics, layered on the transport's
`pre`/`post`/`onError` hooks. Pass them via `middleware`; they observe only
(never alter the request), so they compose with retries and with each other.

```ts
import { Alpaca, middleware } from "@alpaca/sdk";

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
from the [`@alpaca/sdk/rest`](#rest-only-entrypoint) subpath and they are never
loaded.

## REST-only entrypoint

If you never open a stream, import from `@alpaca/sdk/rest` to keep the `ws` /
`@msgpack/msgpack` dependencies out of your module graph (smaller bundles,
faster cold starts). It re-exports everything except the `streaming` namespace.
The `Alpaca` facade is the same class, so all REST methods work unchanged; the
stream factories (`stockStream`, `stream`, ...) and `submitAndWait` throw if
called from this entrypoint — import from `@alpaca/sdk` when you need streams.

```ts
import { Alpaca } from "@alpaca/sdk/rest";
```

## Testing your integration

`@alpaca/sdk/testing` provides a network-free harness so your unit tests don't
hit Alpaca. `mockFetch` answers canned responses by method + path; `createMockAlpaca`
wires one into a ready `Alpaca` client (dummy credentials, rate limiting off).

```ts
import { createMockAlpaca } from "@alpaca/sdk/testing";

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
import { Alpaca } from "@alpaca/sdk";       // ESM
```
```js
const { Alpaca } = require("@alpaca/sdk");  // CJS
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

