# AGENTS.md

Instructions for AI agents and contributors working in the `@alpacahq/alpaca-ts-alpha`
package.

## Overview

`@alpacahq/alpaca-ts-alpha` is a hand-maintained TypeScript SDK for the Alpaca **Trading API**
and **Market Data API**. Notable behaviors to preserve when editing:

- null-safe array deserialization (no NPE on `null` array fields),
- opt-in retry/backoff (`retry`), request timeouts (`timeoutMs`), default
  `User-Agent`,
- typed `ApiError` parsing the `{ code, message }` envelope,
- undocumented-field passthrough on key trading models,
- a `pagination` helper, and a `vitest` test suite.

## Conventions

- **The transport is shared.** The HTTP transport (retry/backoff, timeouts,
 rate limiting, typed errors, middleware, querystring, response wrappers) lives
 once in `src/core/runtime.ts`. `src/trading/runtime.ts` and
 `src/market-data/runtime.ts` are thin shims that `export *` from it and only
 add their host constants plus a `Configuration` subclass overriding
 `defaultBasePath()`. Make transport changes in `src/core/runtime.ts`; touch the
 shims only for host/base-path concerns. Both shims are listed in their
 `.openapi-generator-ignore` so regeneration won't clobber them.
- **Edit `src/` directly** for behavior changes.
- **Keep the capability maps in sync.** When you add an ergonomic helper to
  `TradingClient` / `MarketDataClient` / `OrdersApi` (`src/client.ts`), add it to
  `ergonomicCapabilities` in `src/capabilities.ts` — a test in
  `test/client.test.ts` asserts every listed helper exists on the facade.
- **Linting is scoped to hand-written code.** Biome (linter only; formatter and
  assist are off) lints the hand-maintained TypeScript. The OpenAPI-generated
  `src/trading/{apis,models,index.ts}` and `src/market-data/{apis,models,index.ts}`
  are excluded in `biome.json` — don't lint or hand-edit generated output.
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
