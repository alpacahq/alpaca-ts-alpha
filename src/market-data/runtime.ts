/* tslint:disable */
/* eslint-disable */
/**
 * Market Data API transport.
 *
 * The shared HTTP transport (retry, timeout, rate limiting, typed errors,
 * middleware) lives in `../core/runtime` and is re-exported here. This shim
 * only adds the Market Data host. Unlike trading, market data uses a single
 * host for both paper and live accounts, so the `paper` flag has no effect here
 * (accepted for symmetry with the trading `Configuration`).
 */
export * from "../core/runtime";

import { BaseAPI as CoreBaseAPI, BaseConfiguration } from "../core/runtime";

export const MARKET_DATA_HOST = "https://data.alpaca.markets";

export const BASE_PATH = MARKET_DATA_HOST.replace(/\/+$/, "");

/**
 * Market-data `Configuration`. A single host serves both environments, so the
 * `paper` flag is ignored; an explicit `basePath` still wins.
 */
export class Configuration extends BaseConfiguration {
    protected override defaultBasePath(): string {
        return MARKET_DATA_HOST;
    }
}

export const DefaultConfig = new Configuration();

/**
 * Base class for the generated Market Data API classes. Identical to the shared
 * {@link CoreBaseAPI} but defaults to this package's {@link DefaultConfig} (the
 * market-data host) when constructed without a `Configuration`.
 */
export class BaseAPI extends CoreBaseAPI {
    constructor(configuration: BaseConfiguration = DefaultConfig) {
        super(configuration);
    }
}
