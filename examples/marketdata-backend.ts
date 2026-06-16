/**
 * Minimal market-data backend for a visualization frontend.
 *
 * - GET /stream            Server-Sent Events of live bars for the configured symbols.
 * - GET /price?symbol=AAPL Latest trade price (REST).
 * - GET /bars?symbol=AAPL  Historical daily bars (REST, auto-paginated).
 *
 * Demonstrates: a long-lived market-data WebSocket fanned out to many HTTP
 * clients, plus REST helpers and auto-pagination - no extra web framework.
 *
 * Run:
 *   APCA_KEY_ID=... APCA_SECRET=... npx tsx examples/marketdata-backend.ts
 *   curl -N http://localhost:8080/stream
 *   curl http://localhost:8080/price?symbol=AAPL
 */
import * as http from "node:http";
// In your own app this import is just: import { Alpaca, TimeFrame } from "@alpaca/sdk";
import { Alpaca, TimeFrame } from "../src/index";

const keyId = process.env.APCA_KEY_ID;
const secret = process.env.APCA_SECRET;
if (!keyId || !secret) {
    console.error("Set APCA_KEY_ID and APCA_SECRET in the environment.");
    process.exit(1);
}

const PORT = Number(process.env.PORT ?? 8080);
const SYMBOLS = (process.env.SYMBOLS ?? "AAPL,MSFT").split(",");

const alpaca = new Alpaca({ keyId, secret });

// Fan live bars out to every connected SSE client.
const clients = new Set<http.ServerResponse>();
const stream = alpaca.marketData.stockStream({ feed: "iex" });
stream.onBar((bar) => {
    const frame = `data: ${JSON.stringify(bar)}\n\n`;
    for (const res of clients) res.write(frame);
});
stream.onError((msg) => console.error("stream error:", msg));
stream.onConnect(() => stream.subscribeForBars(SYMBOLS));
stream.connect();

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    try {
        if (url.pathname === "/stream") {
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            });
            res.write(": connected\n\n");
            clients.add(res);
            req.on("close", () => clients.delete(res));
            return;
        }
        if (url.pathname === "/price") {
            const symbol = url.searchParams.get("symbol") ?? SYMBOLS[0];
            const price = await alpaca.marketData.getLatestPrice(symbol);
            sendJson(res, 200, { symbol, price });
            return;
        }
        if (url.pathname === "/bars") {
            const symbol = url.searchParams.get("symbol") ?? SYMBOLS[0];
            const bars = await alpaca.marketData.collectStockBarsBySymbol({
                symbols: [symbol],
                timeframe: TimeFrame.Day,
                start: new Date(url.searchParams.get("start") ?? "2024-01-01"),
            });
            sendJson(res, 200, bars);
            return;
        }
        sendJson(res, 404, { error: "not found" });
    } catch (err) {
        sendJson(res, 500, { error: (err as Error).message });
    }
});

server.listen(PORT, () => {
    console.log(`listening on http://localhost:${PORT} (streaming bars for ${SYMBOLS.join(", ")})`);
});
