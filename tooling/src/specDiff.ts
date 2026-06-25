import { canonicalize } from "./jsonCanonical.js";

export interface SpecDiffSummary {
  schemasAdded: string[];
  schemasRemoved: string[];
  schemasModified: string[];
  operationsAdded: string[];
  operationsRemoved: string[];
}

const HTTP_METHODS = ["get", "put", "post", "delete", "patch", "options", "head", "trace"];

type AnySpec = {
  components?: { schemas?: Record<string, unknown> };
  paths?: Record<string, Record<string, unknown>>;
};

function schemas(spec: AnySpec): Record<string, unknown> {
  return spec.components?.schemas ?? {};
}

function operations(spec: AnySpec): Set<string> {
  const ops = new Set<string>();
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    if (!item || typeof item !== "object") continue;
    for (const method of HTTP_METHODS) {
      if (method in item) ops.add(`${method.toUpperCase()} ${path}`);
    }
  }
  return ops;
}

/** Compute added/removed/modified schemas + added/removed operations. */
export function summarizeSpecDiff(base: unknown, next: unknown): SpecDiffSummary {
  const baseSchemas = schemas(base as AnySpec);
  const nextSchemas = schemas(next as AnySpec);
  const baseKeys = new Set(Object.keys(baseSchemas));
  const nextKeys = new Set(Object.keys(nextSchemas));

  const schemasAdded = [...nextKeys].filter((k) => !baseKeys.has(k)).sort();
  const schemasRemoved = [...baseKeys].filter((k) => !nextKeys.has(k)).sort();
  const schemasModified = [...nextKeys]
    .filter((k) => baseKeys.has(k))
    .filter((k) => canonicalize(baseSchemas[k]) !== canonicalize(nextSchemas[k]))
    .sort();

  const baseOps = operations(base as AnySpec);
  const nextOps = operations(next as AnySpec);
  const operationsAdded = [...nextOps].filter((o) => !baseOps.has(o)).sort();
  const operationsRemoved = [...baseOps].filter((o) => !nextOps.has(o)).sort();

  return { schemasAdded, schemasRemoved, schemasModified, operationsAdded, operationsRemoved };
}

/** Human-readable one-paragraph summary for the console gate. */
export function formatSummary(s: SpecDiffSummary): string {
  const counts =
    `schemas: +${s.schemasAdded.length} -${s.schemasRemoved.length} ~${s.schemasModified.length}; ` +
    `operations: +${s.operationsAdded.length} -${s.operationsRemoved.length}`;
  const lines = [counts];
  const detail = (label: string, items: string[]) => {
    if (items.length) lines.push(`  ${label}: ${items.join(", ")}`);
  };
  detail("schemas added", s.schemasAdded);
  detail("schemas removed", s.schemasRemoved);
  detail("schemas modified", s.schemasModified);
  detail("operations added", s.operationsAdded);
  detail("operations removed", s.operationsRemoved);
  return lines.join("\n");
}

export function hasChanges(s: SpecDiffSummary): boolean {
  return (
    s.schemasAdded.length > 0 ||
    s.schemasRemoved.length > 0 ||
    s.schemasModified.length > 0 ||
    s.operationsAdded.length > 0 ||
    s.operationsRemoved.length > 0
  );
}
