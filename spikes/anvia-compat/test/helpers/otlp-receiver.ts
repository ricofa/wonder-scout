import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Local stand-in for the Lens ingestion endpoint (`/api/public/otel/v1/{traces,logs}`).
 * Receives the REAL OTLP/HTTP payloads produced by @anvia/lens exporters so tests can inspect
 * linkage, redaction and flush. It does not emulate Lens storage/UI.
 */
export type ReceivedRequest = { path: string; headers: IncomingHttpHeaders; raw: string; json: unknown };

export type OtlpSpan = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  status?: { code?: number; message?: string };
  attributes: Record<string, unknown>;
};

type AnyValue = { stringValue?: string; intValue?: string | number; doubleValue?: number; boolValue?: boolean; arrayValue?: { values?: AnyValue[] } };
const flatten = (v: AnyValue | undefined): unknown =>
  v === undefined ? undefined
  : v.stringValue ?? (v.intValue !== undefined ? Number(v.intValue) : undefined) ?? v.doubleValue ?? v.boolValue ?? v.arrayValue?.values?.map(flatten);

export async function startOtlpReceiver() {
  const requests: ReceivedRequest[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let json: unknown;
      try { json = JSON.parse(raw); } catch {}
      requests.push({ path: req.url ?? '', headers: req.headers, raw, json });
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  const spans = (): OtlpSpan[] =>
    requests
      .filter((r) => r.path.endsWith('/v1/traces'))
      .flatMap((r) => ((r.json as { resourceSpans?: { scopeSpans?: { spans?: Record<string, unknown>[] }[] }[] })?.resourceSpans ?? []))
      .flatMap((rs) => rs.scopeSpans ?? [])
      .flatMap((ss) => ss.spans ?? [])
      .map((s) => ({
        ...(s as unknown as OtlpSpan),
        attributes: Object.fromEntries(((s.attributes as { key: string; value: AnyValue }[]) ?? []).map((a) => [a.key, flatten(a.value)])),
      }));

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    spans,
    rawText: () => requests.map((r) => r.raw).join('\n'),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export type OtlpReceiver = Awaited<ReturnType<typeof startOtlpReceiver>>;

/** Walks parent links; true when `ancestorId` is on the path from `span` to the root. */
export function hasAncestor(spans: readonly OtlpSpan[], span: OtlpSpan, ancestorId: string): boolean {
  const byId = new Map(spans.map((s) => [s.spanId, s]));
  for (let cur = span.parentSpanId ? byId.get(span.parentSpanId) : undefined; cur; cur = cur.parentSpanId ? byId.get(cur.parentSpanId) : undefined) {
    if (cur.spanId === ancestorId) return true;
  }
  return false;
}
