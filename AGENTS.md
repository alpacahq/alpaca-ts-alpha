# AGENTS.md

Instructions for AI agents and contributors working in the `@alpaca/sdk`
package.

## Overview

`@alpaca/sdk` is a hand-maintained TypeScript SDK for the Alpaca **Trading API**
and **Market Data API**. Notable behaviors to preserve when editing:

- null-safe array deserialization (no NPE on `null` array fields),
- opt-in retry/backoff (`retry`), request timeouts (`timeoutMs`), default
  `User-Agent`,
- typed `ApiError` parsing the `{ code, message }` envelope,
- undocumented-field passthrough on key trading models,
- a `pagination` helper, and a `vitest` test suite.

## Conventions

- **The transport is duplicated.** `src/trading/runtime.ts` and
  `src/market-data/runtime.ts` are near-identical copies (they differ only in
  the header comment and `BASE_PATH`). Apply any runtime/transport change to
  **both** files and keep them in sync.
- **Edit `src/` directly** for behavior changes.
- Keep the test suite green and add coverage for new behavior.

## Commands

```bash
npm install       # also builds via the `prepare` script
npm run build     # tsup -> dist/ (dual ESM + CJS)
npm run typecheck # tsc --noEmit (the type authority)
npm test          # vitest
```
