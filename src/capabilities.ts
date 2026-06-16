/**
 * Capability map / cheatsheet for the Alpaca SDK.
 *
 * The generated SDK exposes ~27 `Api` classes. Without an index, integrators
 * have to grep the source to learn that `getAccount` lives on `AccountsApi` and
 * historical bars live on `StockApi`. This module is the discoverability aid:
 * a flat, typed list mapping each {@link Alpaca} facade accessor to its
 * underlying `Api` class and its common methods, plus a {@link findCapabilities}
 * lookup that answers "which accessor has this method?".
 *
 * The `methods` lists are representative of the most-used operations, not an
 * exhaustive dump of every generated method (each REST method also has a
 * `...Raw()` variant returning the raw `Response`). Hand-written and
 * generation-safe.
 */

/** Which facade sub-client tree an `Api` lives under. */
export type CapabilityGroup = "trading" | "marketData";

/** One row of the capability map: a facade accessor and what it wraps. */
export interface CapabilityEntry {
    /** Dotted facade accessor, e.g. `"trading.orders"`. */
    accessor: string;
    /** Underlying generated `Api` class name, e.g. `"OrdersApi"`. */
    api: string;
    /** Sub-client tree the `Api` lives in. */
    group: CapabilityGroup;
    /** One-line description of what the accessor is for. */
    summary: string;
    /** Representative public methods (non-exhaustive; excludes `...Raw`). */
    methods: string[];
}

/** A real-time streaming factory exposed on the facade. */
export interface StreamCapabilityEntry {
    /** Dotted facade accessor, e.g. `"marketData.stockStream"`. */
    accessor: string;
    /** Stream class returned by the factory. */
    stream: string;
    /** Sub-client tree the factory lives in. */
    group: CapabilityGroup;
    /** One-line description. */
    summary: string;
}

/** REST capability map, keyed by facade accessor. */
export const capabilities: readonly CapabilityEntry[] = [
    // --- Trading ---------------------------------------------------------
    {
        accessor: "trading.account",
        api: "AccountsApi",
        group: "trading",
        summary: "Account details, balances, buying power and status.",
        methods: ["getAccount"],
    },
    {
        accessor: "trading.accountActivities",
        api: "AccountActivitiesApi",
        group: "trading",
        summary: "Account activity history (fills, fees, dividends, transfers).",
        methods: ["getAccountActivities", "getAccountActivitiesByActivityType"],
    },
    {
        accessor: "trading.accountConfigurations",
        api: "AccountConfigurationsApi",
        group: "trading",
        summary: "Read and update trading account configuration.",
        methods: ["getAccountConfig", "patchAccountConfig"],
    },
    {
        accessor: "trading.assets",
        api: "AssetsApi",
        group: "trading",
        summary: "Tradable assets, option contracts and instrument reference data.",
        methods: [
            "getV2Assets",
            "getV2AssetsSymbolOrAssetId",
            "getOptionsContracts",
            "getOptionContractSymbolOrId",
            "usCorporates",
            "usTreasuries",
        ],
    },
    {
        accessor: "trading.calendar",
        api: "CalendarApi",
        group: "trading",
        summary: "Market calendar and clock (open/close, sessions).",
        methods: ["calendar", "clock", "legacyCalendar", "legacyClock"],
    },
    {
        accessor: "trading.corporateActions",
        api: "CorporateActionsApi",
        group: "trading",
        summary: "Corporate-action announcements (splits, dividends, mergers).",
        methods: [
            "getV2CorporateActionsAnnouncements",
            "getV2CorporateActionsAnnouncementsId",
        ],
    },
    {
        accessor: "trading.cryptoFunding",
        api: "CryptoFundingApi",
        group: "trading",
        summary: "Crypto wallets, transfers and whitelisted withdrawal addresses.",
        methods: [
            "createCryptoTransferForAccount",
            "getCryptoFundingTransfer",
            "listCryptoFundingTransfers",
            "getCryptoTransferEstimate",
            "listCryptoFundingWallets",
            "createWhitelistedAddress",
            "deleteWhitelistedAddress",
            "listWhitelistedAddress",
        ],
    },
    {
        accessor: "trading.cryptoPerpetualsAccountVitals",
        api: "CryptoPerpetualsAccountVitalsBetaApi",
        group: "trading",
        summary: "Crypto perpetual-futures account vitals (beta).",
        methods: ["getCryptoPerpAccountVitals"],
    },
    {
        accessor: "trading.cryptoPerpetualsFunding",
        api: "CryptoPerpetualsFundingBetaApi",
        group: "trading",
        summary: "Crypto perpetual-futures wallets and transfers (beta).",
        methods: [
            "createCryptoPerpTransferForAccount",
            "getCryptoPerpFundingTransfer",
            "getCryptoPerpTransferEstimate",
            "listCryptoPerpFundingTransfers",
            "listCryptoPerpFundingWallets",
            "createWhitelistedPerpAddress",
            "deleteWhitelistedPerpAddress",
            "listWhitelistedPerpAddress",
        ],
    },
    {
        accessor: "trading.cryptoPerpetualsLeverage",
        api: "CryptoPerpetualsLeverageBetaApi",
        group: "trading",
        summary: "Read/set crypto perpetual-futures account leverage (beta).",
        methods: ["getCryptoPerpAccountLeverage", "setCryptoPerpAccountLeverage"],
    },
    {
        accessor: "trading.events",
        api: "EventsApi",
        group: "trading",
        summary: "Server-sent event streams for account activity.",
        methods: ["subscribeToActivitiesSSE"],
    },
    {
        accessor: "trading.orders",
        api: "OrdersApi",
        group: "trading",
        summary: "Place, read, replace and cancel orders.",
        methods: [
            "getAllOrders",
            "postOrder",
            "getOrderByOrderID",
            "getOrderByClientOrderId",
            "patchOrderByOrderId",
            "deleteOrderByOrderID",
            "deleteAllOrders",
        ],
    },
    {
        accessor: "trading.portfolioHistory",
        api: "PortfolioHistoryApi",
        group: "trading",
        summary: "Time series of account equity / P&L.",
        methods: ["getAccountPortfolioHistory"],
    },
    {
        accessor: "trading.positions",
        api: "PositionsApi",
        group: "trading",
        summary: "Open positions; close positions; exercise options.",
        methods: [
            "getAllOpenPositions",
            "getOpenPosition",
            "deleteAllOpenPositions",
            "deleteOpenPosition",
            "optionExercise",
            "optionDoNotExercise",
        ],
    },
    {
        accessor: "trading.tokenization",
        api: "TokenizationApi",
        group: "trading",
        summary: "Tokenization requests and minting.",
        methods: ["getTokenizationRequests", "postTokenizationMint"],
    },
    {
        accessor: "trading.watchlists",
        api: "WatchlistsApi",
        group: "trading",
        summary: "Create and manage watchlists and their assets.",
        methods: [
            "getWatchlists",
            "getWatchlistById",
            "getWatchlistByName",
            "postWatchlist",
            "updateWatchlistById",
            "updateWatchlistByName",
            "addAssetToWatchlist",
            "addAssetToWatchlistByName",
            "removeAssetFromWatchlist",
            "deleteWatchlistById",
            "deleteWatchlistByName",
        ],
    },

    // --- Market data -----------------------------------------------------
    {
        accessor: "marketData.stocks",
        api: "StockApi",
        group: "marketData",
        summary: "US-equity bars, trades, quotes, auctions and snapshots.",
        methods: [
            "stockBars",
            "stockTrades",
            "stockQuotes",
            "stockAuctions",
            "stockSnapshots",
            "stockLatestBars",
            "stockLatestQuotes",
            "stockLatestTrades",
            "stockMetaConditions",
            "stockMetaExchanges",
        ],
    },
    {
        accessor: "marketData.crypto",
        api: "CryptoApi",
        group: "marketData",
        summary: "Crypto bars, trades, quotes, orderbooks and snapshots.",
        methods: [
            "cryptoBars",
            "cryptoTrades",
            "cryptoQuotes",
            "cryptoSnapshots",
            "cryptoLatestBars",
            "cryptoLatestQuotes",
            "cryptoLatestTrades",
            "cryptoLatestOrderbooks",
        ],
    },
    {
        accessor: "marketData.cryptoPerpetualFutures",
        api: "CryptoPerpetualFuturesApi",
        group: "marketData",
        summary: "Crypto perpetual-futures latest market data.",
        methods: [
            "cryptoPerpLatestBars",
            "cryptoPerpLatestQuotes",
            "cryptoPerpLatestTrades",
            "cryptoPerpLatestOrderbooks",
            "cryptoPerpLatestFuturesPricing",
        ],
    },
    {
        accessor: "marketData.fixedIncome",
        api: "FixedIncomeApi",
        group: "marketData",
        summary: "Fixed-income latest prices and quotes.",
        methods: ["fixedIncomeLatestPrices", "fixedIncomeLatestQuotes"],
    },
    {
        accessor: "marketData.forex",
        api: "ForexApi",
        group: "marketData",
        summary: "Foreign-exchange historical and latest rates.",
        methods: ["rates", "latestRates"],
    },
    {
        accessor: "marketData.indices",
        api: "IndexApi",
        group: "marketData",
        summary: "Index historical and latest values.",
        methods: ["indexValues", "indexLatestValues"],
    },
    {
        accessor: "marketData.logos",
        api: "LogosApi",
        group: "marketData",
        summary: "Company logo images.",
        methods: ["logos"],
    },
    {
        accessor: "marketData.news",
        api: "NewsApi",
        group: "marketData",
        summary: "Market news articles.",
        methods: ["news"],
    },
    {
        accessor: "marketData.options",
        api: "OptionApi",
        group: "marketData",
        summary: "Options bars, trades, chains and snapshots.",
        methods: [
            "optionBars",
            "optionTrades",
            "optionChain",
            "optionSnapshots",
            "optionLatestQuotes",
            "optionLatestTrades",
            "optionMetaConditions",
            "optionMetaExchanges",
        ],
    },
    {
        accessor: "marketData.screener",
        api: "ScreenerApi",
        group: "marketData",
        summary: "Market movers and most-active screeners.",
        methods: ["mostActives", "movers"],
    },
    {
        accessor: "marketData.corporateActions",
        api: "CorporateActionsApi",
        group: "marketData",
        summary: "Historical corporate-action data.",
        methods: ["corporateActions"],
    },
] as const;

/** Real-time streaming factories exposed on the facade. */
export const streamingCapabilities: readonly StreamCapabilityEntry[] = [
    {
        accessor: "trading.stream",
        stream: "TradingStream",
        group: "trading",
        summary: "Real-time order/account updates (JSON).",
    },
    {
        accessor: "marketData.stockStream",
        stream: "StockDataStream",
        group: "marketData",
        summary: "Real-time US-equity bars/trades/quotes (msgpack).",
    },
    {
        accessor: "marketData.cryptoStream",
        stream: "CryptoDataStream",
        group: "marketData",
        summary: "Real-time crypto market data (msgpack).",
    },
    {
        accessor: "marketData.optionStream",
        stream: "OptionDataStream",
        group: "marketData",
        summary: "Real-time options market data (msgpack).",
    },
    {
        accessor: "marketData.newsStream",
        stream: "NewsStream",
        group: "marketData",
        summary: "Real-time news headlines.",
    },
] as const;

/**
 * Find the capability entries whose `methods` include `methodName`. Useful for
 * answering "where does `getAccount` live?" - returns `trading.account` /
 * `AccountsApi`. Matching is case-insensitive.
 */
export function findCapabilities(methodName: string): CapabilityEntry[] {
    const needle = methodName.toLowerCase();
    return capabilities.filter((entry) =>
        entry.methods.some((m) => m.toLowerCase() === needle),
    );
}
