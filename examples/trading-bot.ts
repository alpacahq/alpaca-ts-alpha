/**
 * Minimal paper trading bot.
 *
 * Demonstrates: the `Alpaca` facade, reading the account, a market-data lookup,
 * the trade-updates stream, and `submitAndWait` (place an order and block until
 * it reaches a terminal state).
 *
 * Run:
 *   APCA_KEY_ID=... APCA_SECRET=... npx tsx examples/trading-bot.ts
 */
// In your own app this import is just: import { Alpaca, ApiError } from "@alpaca/sdk";
import { Alpaca, ApiError } from "../src/index";

async function main(): Promise<void> {
    const keyId = process.env.APCA_KEY_ID;
    const secret = process.env.APCA_SECRET;
    if (!keyId || !secret) {
        console.error("Set APCA_KEY_ID and APCA_SECRET in the environment.");
        process.exit(1);
    }

    const alpaca = new Alpaca({
        keyId,
        secret,
        paper: true,
        timeoutMs: 10_000,
        retry: { maxRetries: 3 }, // covers transient 5xx AND network errors on GETs
    });

    const account = await alpaca.trading.account.getAccount();
    console.log(`account ${account.accountNumber} status=${account.status} buyingPower=${account.buyingPower}`);

    const price = await alpaca.marketData.getLatestPrice("AAPL");
    console.log(`AAPL last trade: ${price ?? "n/a"}`);

    // Stream order/account updates in the background.
    const updates = alpaca.trading.stream();
    updates.onTradeUpdate((u) => console.log(`trade update: ${u.event} ${u.order.symbol} -> ${u.order.status}`));
    updates.onError((msg) => console.error("stream error:", msg));
    updates.onConnect(() => updates.subscribeTradeUpdates());
    updates.connect();

    try {
        const order = await alpaca.trading.submitAndWait(
            { type: "market", symbol: "AAPL", qty: 1, side: "buy" },
            { timeoutMs: 30_000 },
        );
        console.log(`order ${order.id} reached ${order.status} (filledAvgPrice=${order.filledAvgPrice ?? "n/a"})`);
    } catch (err) {
        if (err instanceof ApiError) {
            console.error(`order rejected: HTTP ${err.status} ${err.message}`);
        } else {
            console.error("submitAndWait failed:", (err as Error).message);
        }
    } finally {
        updates.disconnect();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
