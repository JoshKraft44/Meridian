import { createHmac } from 'crypto';

// Kept free of $env imports so bin/ scripts can reuse it outside SvelteKit.

export const GRAPH_VERSION = 'v24.0';
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export interface MetaCredentials {
  token: string;
  appSecret?: string;
}

export type MetaErrorKind = 'auth' | 'permission' | 'rate_limit' | 'not_found' | 'other';

export class MetaApiError extends Error {
  constructor(
    message: string,
    public kind: MetaErrorKind,
    public code: number | null,
    public subcode: number | null,
    public fbtraceId: string | null
  ) {
    super(message);
  }
}

interface GraphErrorBody {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

// https://developers.facebook.com/docs/graph-api/guides/error-handling
function classify(code: number | null, status: number): MetaErrorKind {
  if (code === 190 || code === 102 || status === 401) return 'auth';
  if (code === 4 || code === 17 || code === 32 || code === 613) return 'rate_limit';
  if (code !== null && code >= 80000 && code <= 80014) return 'rate_limit';
  if (code === 10 || (code !== null && code >= 200 && code <= 299)) return 'permission';
  if (code === 100 && status === 404) return 'not_found';
  return 'other';
}

function appSecretProof(token: string, appSecret: string): string {
  return createHmac('sha256', appSecret).update(token).digest('hex');
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function toError(res: Response): Promise<MetaApiError> {
  let body: GraphErrorBody = {};
  try {
    body = await res.json();
  } catch {
    // non-JSON error body, fall through with status only
  }
  const code = body.error?.code ?? null;
  return new MetaApiError(
    body.error?.message ?? `meta api ${res.status}`,
    classify(code, res.status),
    code,
    body.error?.error_subcode ?? null,
    body.error?.fbtrace_id ?? null
  );
}

// Token goes in the Authorization header so it never ends up in a logged URL.
export async function metaGet<T>(
  path: string,
  creds: MetaCredentials,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (creds.appSecret) url.searchParams.set('appsecret_proof', appSecretProof(creds.token, creds.appSecret));

  // Reads only: retry throttling twice, then give up. Writes should never be blindly retried.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${creds.token}` } });
    if (res.ok) return res.json() as Promise<T>;

    const err = await toError(res);
    if (err.kind !== 'rate_limit' || attempt >= 2) throw err;

    const waitMs = (attempt + 1) * 5000;
    console.warn(`[meta] throttled (code ${err.code}) on ${path}, retrying in ${waitMs / 1000}s`);
    await sleep(waitMs);
  }
}

// Writes are never retried: a timeout after Meta accepted the request would double-post.
export async function metaPost<T>(
  path: string,
  creds: MetaCredentials,
  params: Record<string, string>
): Promise<T> {
  const body = new URLSearchParams(params);
  if (creds.appSecret) body.set('appsecret_proof', appSecretProof(creds.token, creds.appSecret));

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.token}` },
    body
  });
  if (!res.ok) throw await toError(res);
  return res.json() as Promise<T>;
}

// Follows cursor paging on list edges (campaigns, insights, ...)
export async function* metaGetPages<T>(
  path: string,
  creds: MetaCredentials,
  params: Record<string, string> = {}
): AsyncGenerator<T[]> {
  let after: string | undefined;

  while (true) {
    const page = await metaGet<{ data: T[]; paging?: { next?: string; cursors?: { after?: string } } }>(
      path,
      creds,
      after ? { ...params, after } : params
    );
    if (page.data.length > 0) yield page.data;

    after = page.paging?.cursors?.after;
    if (!page.paging?.next || !after) return;
  }
}

// debug_token needs an app token (app_id|app_secret), not the token being inspected.
export interface TokenDebugInfo {
  app_id: string;
  application?: string;
  type: string;
  is_valid: boolean;
  expires_at: number; // 0 = never
  data_access_expires_at?: number;
  scopes: string[];
  granular_scopes?: { scope: string; target_ids?: string[] }[];
  user_id?: string;
  error?: { message: string; code: number };
}

export async function debugToken(token: string, appId: string, appSecret: string): Promise<TokenDebugInfo> {
  const url = new URL(`${BASE}/debug_token`);
  url.searchParams.set('input_token', token);

  const res = await fetch(url, { headers: { Authorization: `Bearer ${appId}|${appSecret}` } });
  if (!res.ok) throw await toError(res);

  const body: { data: TokenDebugInfo } = await res.json();
  return body.data;
}
