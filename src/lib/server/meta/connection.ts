import { metaGet, debugToken, MetaApiError, type MetaCredentials, type MetaErrorKind, type TokenDebugInfo } from './api';

export interface MetaConfig {
  token: string;
  appId?: string;
  appSecret?: string;
  adAccountId?: string;
}

type Check<T> = { ok: true; data: T } | { ok: false; error: { kind: MetaErrorKind; message: string; code: number | null } };

async function check<T>(fn: () => Promise<T>): Promise<Check<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof MetaApiError) {
      return { ok: false, error: { kind: err.kind, message: err.message, code: err.code } };
    }
    return { ok: false, error: { kind: 'other', message: (err as Error).message, code: null } };
  }
}

export interface MetaPage {
  id: string;
  name: string;
  tasks?: string[];
  instagram_business_account?: {
    id: string;
    username?: string;
    followers_count?: number;
    media_count?: number;
  };
}

export interface MetaAdAccount {
  id: string;
  name: string;
  account_status: number;
  currency: string;
  timezone_name: string;
  amount_spent: string; // minor units, as a string
  disable_reason?: number;
  business?: { id: string; name: string };
}

// What each planned feature needs. Facebook Login scope names, since the token comes from a system user.
const CAPABILITIES = [
  { label: 'List Pages', scopes: ['pages_show_list'] },
  { label: 'Publish to Facebook Page', scopes: ['pages_manage_posts', 'pages_read_engagement'] },
  { label: 'Publish to Instagram', scopes: ['instagram_basic', 'instagram_content_publish'] },
  { label: 'Instagram insights', scopes: ['instagram_basic', 'instagram_manage_insights'] },
  { label: 'Page insights', scopes: ['read_insights'] },
  { label: 'Read ad performance', scopes: ['ads_read'] },
  { label: 'Create / edit campaigns', scopes: ['ads_management'] },
  { label: 'Business assets', scopes: ['business_management'] }
];

export interface Capability {
  label: string;
  scopes: string[];
  missing: string[];
  granted: boolean | null; // null when scopes couldn't be read
}

export function normalizeAdAccountId(id: string): string {
  return id.trim().replace(/^act_/, '');
}

export async function checkMetaConnection(config: MetaConfig) {
  const creds: MetaCredentials = { token: config.token, appSecret: config.appSecret };

  // debug_token is the most informative (type, expiry, granular targets) but needs app credentials.
  // /me/permissions is the fallback for the scope list.
  const tokenInfo: Check<TokenDebugInfo | null> =
    config.appId && config.appSecret
      ? await check(() => debugToken(config.token, config.appId!, config.appSecret!))
      : { ok: true, data: null };

  const [me, permissions, pages] = await Promise.all([
    check(() => metaGet<{ id: string; name: string }>('/me', creds, { fields: 'id,name' })),
    check(() =>
      metaGet<{ data: { permission: string; status: string }[] }>('/me/permissions', creds).then((r) =>
        r.data.filter((p) => p.status === 'granted').map((p) => p.permission)
      )
    ),
    check(() =>
      metaGet<{ data: MetaPage[] }>('/me/accounts', creds, {
        fields: 'id,name,tasks,instagram_business_account{id,username,followers_count,media_count}'
      }).then((r) => r.data)
    )
  ]);

  let scopes: string[] | null = null;
  if (tokenInfo.ok && tokenInfo.data?.is_valid) scopes = tokenInfo.data.scopes;
  else if (permissions.ok) scopes = permissions.data;

  const capabilities: Capability[] = CAPABILITIES.map((c) => {
    const missing = scopes ? c.scopes.filter((s) => !scopes!.includes(s)) : [];
    return { ...c, missing, granted: scopes ? missing.length === 0 : null };
  });

  let adAccount: Check<MetaAdAccount> | null = null;
  let adSpend7d: Check<{ spendCents: number; impressions: number; clicks: number }> | null = null;

  if (config.adAccountId) {
    const actId = `act_${normalizeAdAccountId(config.adAccountId)}`;

    [adAccount, adSpend7d] = await Promise.all([
      check(() =>
        metaGet<MetaAdAccount>(`/${actId}`, creds, {
          fields: 'id,name,account_status,currency,timezone_name,amount_spent,disable_reason'
        })
      ),
      // Confirms ads_read actually works against this account, not just that the scope exists
      check(async () => {
        const r = await metaGet<{ data: { spend?: string; impressions?: string; clicks?: string }[] }>(
          `/${actId}/insights`,
          creds,
          { date_preset: 'last_7d', level: 'account', fields: 'spend,impressions,clicks' }
        );
        const row = r.data[0];
        return {
          spendCents: row?.spend ? Math.round(parseFloat(row.spend) * 100) : 0,
          impressions: row?.impressions ? parseInt(row.impressions) : 0,
          clicks: row?.clicks ? parseInt(row.clicks) : 0
        };
      })
    ]);
  }

  return { tokenInfo, me, scopes, capabilities, pages, adAccount, adSpend7d };
}

export type MetaConnectionReport = Awaited<ReturnType<typeof checkMetaConnection>>;
