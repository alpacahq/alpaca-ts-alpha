/**
 * Generation-safe authentication helpers for Alpaca's API key + secret scheme.
 *
 * Alpaca authenticates with two distinct headers:
 *   - `APCA-API-KEY-ID`     (your key id)
 *   - `APCA-API-SECRET-KEY` (your secret)
 *
 * The generated `Configuration` reads keys through a callback keyed by header
 * name, which makes the naive `apiKey: "..."` send the *same* value for both
 * headers and fail with an opaque 403. These helpers remove that footgun: pass
 * `{ keyId, secret }` and get back a correctly name-keyed resolver that works
 * with both the `trading` and `marketData` `Configuration` classes.
 *
 * This module is hand-written and lives outside the generated `apis/`/`models/`
 * trees so it survives SDK regeneration.
 *
 * @example
 * ```ts
 * import { trading, auth } from "@alpaca/sdk";
 *
 * // Preferred: keyId/secret are accepted directly by Configuration.
 * const config = new trading.Configuration({ keyId, secret });
 *
 * // Equivalent, if you need to compose the resolver yourself:
 * const config2 = new trading.Configuration({ apiKey: auth.apiKeyAuth({ keyId, secret }) });
 * ```
 */

/** Header carrying the Alpaca API key id. */
export const API_KEY_ID_HEADER = "APCA-API-KEY-ID";

/** Header carrying the Alpaca API secret. */
export const API_SECRET_KEY_HEADER = "APCA-API-SECRET-KEY";

/** Alpaca API key + secret pair. */
export interface AlpacaCredentials {
    /** API key id, sent as the `APCA-API-KEY-ID` header. */
    keyId: string;
    /** API secret, sent as the `APCA-API-SECRET-KEY` header. */
    secret: string;
}

/** A resolver compatible with `ConfigurationParameters.apiKey`. */
export type ApiKeyResolver = (name: string) => string;

/**
 * Builds a name-keyed resolver that returns the correct value for each Alpaca
 * auth header. Throws early (rather than failing with a 403 at request time) if
 * either credential is missing or an unexpected header is requested.
 */
export function apiKeyAuth(credentials: AlpacaCredentials): ApiKeyResolver {
    const keyId = credentials?.keyId;
    const secret = credentials?.secret;
    if (!keyId || !secret) {
        throw new Error(
            "Alpaca authentication requires both `keyId` and `secret`. " +
            "Pass them as `apiKeyAuth({ keyId, secret })` or `new Configuration({ keyId, secret })`.",
        );
    }
    return (name: string): string => {
        switch (name) {
            case API_KEY_ID_HEADER:
                return keyId;
            case API_SECRET_KEY_HEADER:
                return secret;
            default:
                throw new Error(`Unexpected API key header requested: "${name}".`);
        }
    };
}
