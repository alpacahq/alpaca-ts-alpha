# Examples

Runnable, end-to-end examples for `@alpaca/sdk`. They import from the local
source (`../src`) so they run straight from this repo; in your own app the
imports are simply `from "@alpaca/sdk"` (shown in a comment at the top of each
file).

## Prerequisites

- Node.js >= 18
- Paper-trading API credentials from <https://app.alpaca.markets/paper/dashboard/overview>
- [`tsx`](https://github.com/privatenumber/tsx) to run TypeScript directly
  (`npx tsx ...` will fetch it on first use)

Export your credentials once:

```bash
export APCA_KEY_ID="your-key-id"
export APCA_SECRET="your-secret"
```

## [`trading-bot.ts`](./trading-bot.ts)

A paper trading bot: reads the account, looks up the latest price, streams
order/account updates, and places a market order with `submitAndWait` (which
blocks until the order reaches a terminal state).

```bash
npx tsx examples/trading-bot.ts
```

## [`marketdata-backend.ts`](./marketdata-backend.ts)

A tiny market-data backend for a visualization frontend. A single live
market-data WebSocket is fanned out to many HTTP clients over Server-Sent
Events, alongside REST routes for the latest price and historical bars.

```bash
npx tsx examples/marketdata-backend.ts

# in another shell:
curl -N http://localhost:8080/stream
curl "http://localhost:8080/price?symbol=AAPL"
curl "http://localhost:8080/bars?symbol=AAPL&start=2024-01-01"
```

Configure with `PORT` (default `8080`) and `SYMBOLS` (default `AAPL,MSFT`).
