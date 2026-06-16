/**
 * Pure renderer for the README API reference block.
 *
 * Joins the capability maps in `src/capabilities.ts` with the hand-maintained
 * examples in `./examples.ts` and emits the markdown that lives between the
 * `<!-- API-REFERENCE:START -->` / `<!-- API-REFERENCE:END -->` markers. The
 * writer (`scripts/gen-api-reference.ts`) and the drift guard
 * (`test/api-reference.test.ts`) both call into here, so the generated output
 * and the test can never disagree.
 */

import {
    capabilities,
    ergonomicCapabilities,
    streamingCapabilities,
    type CapabilityEntry,
    type ErgonomicHelperEntry,
} from "../../src/capabilities.ts";
import { examples } from "./examples.ts";

/** Opening marker that fences the generated block in the README. */
export const START_MARKER = "<!-- API-REFERENCE:START -->";
/** Closing marker that fences the generated block in the README. */
export const END_MARKER = "<!-- API-REFERENCE:END -->";

/** Human-readable label for each ergonomic helper kind, used in subheadings. */
const KIND_LABELS: Record<ErgonomicHelperEntry["kind"], string> = {
    orderBuilder: "order builders",
    workflow: "workflow helpers",
    normalized: "normalized accessors",
    pagination: "pagination helpers",
};

/**
 * Every documentation key, in render order: `accessor.method` for each REST and
 * ergonomic method, and the bare `accessor` for each streaming factory. The
 * drift guard compares this to the keys of the examples map.
 */
export function referenceKeys(): string[] {
    const keys: string[] = [];
    for (const entry of capabilities) {
        for (const method of entry.methods) keys.push(`${entry.accessor}.${method}`);
    }
    for (const entry of streamingCapabilities) keys.push(entry.accessor);
    for (const entry of ergonomicCapabilities) {
        for (const method of entry.methods) keys.push(`${entry.accessor}.${method}`);
    }
    return keys;
}

function lookup(key: string): { description: string; example: string } {
    const entry = examples[key];
    if (!entry) {
        throw new Error(
            `Missing API-reference example for "${key}". Add it to scripts/api-reference/examples.ts, then run \`npm run docs:api\`.`,
        );
    }
    return entry;
}

function methodBlock(key: string): string[] {
    const { description, example } = lookup(key);
    return [`##### \`alpaca.${key}\``, "", description, "", "```ts", example, "```", ""];
}

function restGroup(title: string, entries: readonly CapabilityEntry[]): string[] {
    const lines: string[] = [`### ${title}`, ""];
    for (const entry of entries) {
        lines.push(`#### \`alpaca.${entry.accessor}\` — ${entry.api}`, "", entry.summary, "");
        for (const method of entry.methods) {
            lines.push(...methodBlock(`${entry.accessor}.${method}`));
        }
    }
    return lines;
}

function streamingGroup(): string[] {
    const lines: string[] = ["### Real-time streaming", ""];
    for (const entry of streamingCapabilities) {
        const { description, example } = lookup(entry.accessor);
        lines.push(
            `#### \`alpaca.${entry.accessor}\` — ${entry.stream}`,
            "",
            description,
            "",
            "```ts",
            example,
            "```",
            "",
        );
    }
    return lines;
}

function ergonomicGroup(): string[] {
    const lines: string[] = ["### Ergonomic helpers", ""];
    for (const entry of ergonomicCapabilities) {
        lines.push(
            `#### \`alpaca.${entry.accessor}\` — ${KIND_LABELS[entry.kind]}`,
            "",
            entry.summary,
            "",
        );
        for (const method of entry.methods) {
            lines.push(...methodBlock(`${entry.accessor}.${method}`));
        }
    }
    return lines;
}

/**
 * Render the full API reference markdown block (without the surrounding
 * markers). Throws if any documented method lacks an examples entry.
 */
export function renderApiReference(): string {
    const trading = capabilities.filter((c) => c.group === "trading");
    const marketData = capabilities.filter((c) => c.group === "marketData");
    const lines = [
        ...restGroup("Trading API", trading),
        ...restGroup("Market Data API", marketData),
        ...streamingGroup(),
        ...ergonomicGroup(),
    ];
    return lines.join("\n").trimEnd();
}

/**
 * Splice {@link renderApiReference} between the markers in a README string,
 * returning the updated document. Idempotent: applying it to an in-sync README
 * yields the same string (this is what the drift guard asserts). Throws if
 * either marker is absent or out of order.
 */
export function applyReference(readme: string): string {
    const startIdx = readme.indexOf(START_MARKER);
    const endIdx = readme.indexOf(END_MARKER);
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
        throw new Error(
            `README is missing the ${START_MARKER} / ${END_MARKER} markers (in order).`,
        );
    }
    const before = readme.slice(0, startIdx + START_MARKER.length);
    const after = readme.slice(endIdx);
    return `${before}\n\n${renderApiReference()}\n\n${after}`;
}
