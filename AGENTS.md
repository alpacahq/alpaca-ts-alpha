# AGENTS.md

Instructions for AI agents and contributors working in the `@alpacahq/alpaca-ts-alpha`
package.

## Overview

`@alpacahq/alpaca-ts-alpha` is a TypeScript SDK for the Alpaca **Trading API**
and **Market Data API**. It was originally scaffolded with OpenAPI Generator but
is now fully hand-maintained — there are **no further regenerations**. The
generated REST clients/models are left untouched so they stay a faithful snapshot
of Alpaca's OpenAPI spec; every convenience is hand-written in separate modules
(see the first convention below). Notable behaviors to preserve when editing:

- null-safe array deserialization (no NPE on `null` array fields),
- opt-in retry/backoff (`retry`), request timeouts (`timeoutMs`), default
  `User-Agent`,
- typed `ApiError` parsing the `{ code, message }` envelope,
- undocumented-field passthrough on key trading models,
- a `pagination` helper, and a `vitest` test suite.

## Conventions

- **Generated vs hand-written — the generated trees are frozen.** The SDK was
  generated once with OpenAPI Generator and is no longer regenerated. The
  `src/trading/{apis,models,index.ts}` and `src/market-data/{apis,models,index.ts}`
  trees are that generated output: treat them as a read-only snapshot of the spec
  and **never hand-edit them** (keeping them pristine lets us diff cleanly against
  the spec). All behavior, ergonomics, and fixes live in hand-written modules
  outside those trees (`src/client.ts`, `src/orders.ts`, `src/marketDataShapes.ts`,
  `src/core/runtime.ts`, `src/streaming/`, ...).
- **The transport is shared.** The HTTP transport (retry/backoff, timeouts,
 rate limiting, typed errors, middleware, querystring, response wrappers) lives
 once in `src/core/runtime.ts`. `src/trading/runtime.ts` and
 `src/market-data/runtime.ts` are thin shims that `export *` from it and only
 add their host constants plus a `Configuration` subclass overriding
 `defaultBasePath()`. Make transport changes in `src/core/runtime.ts`; touch the
 shims only for host/base-path concerns. These shims sit inside the generated
 trees but are hand-maintained transport code (historically protected by
 `.openapi-generator-ignore`); since the SDK is no longer regenerated, just treat
 them as the hand-written exceptions inside those otherwise-frozen trees.
- **Edit `src/` directly** for behavior changes.
- **Keep the capability maps in sync.** When you add an ergonomic helper to
  `TradingClient` / `MarketDataClient` / `OrdersApi` (`src/client.ts`), add it to
  `ergonomicCapabilities` in `src/capabilities.ts` — a test in
  `test/client.test.ts` asserts every listed helper exists on the facade.
- **Linting is scoped to hand-written code.** Biome (linter only; formatter and
  assist are off) lints the hand-maintained TypeScript. The OpenAPI-generated
  `src/trading/{apis,models,index.ts}` and `src/market-data/{apis,models,index.ts}`
  are excluded in `biome.json` — they're the frozen generated snapshot, so don't
  lint or hand-edit them.
- Keep the test suite green and add coverage for new behavior.

## Commands

```bash
npm install       # also builds via the `prepare` script
npm run build     # tsup -> dist/ (dual ESM + CJS)
npm run typecheck # tsc --noEmit (the type authority)
npm test          # vitest
npm run lint      # biome lint (hand-written code; generated apis/models are ignored)
npm run lint:fix  # biome lint --write (apply safe autofixes)
```
