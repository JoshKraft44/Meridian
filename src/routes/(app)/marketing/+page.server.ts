import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { checkMetaConnection } from '$lib/server/meta/connection';

export const load: PageServerLoad = async () => {
  const token = env.META_ACCESS_TOKEN;
  if (!token) {
    return { configured: false as const, adAccountId: env.META_AD_ACCOUNT_ID ?? null };
  }

  const report = await checkMetaConnection({
    token,
    appId: env.META_APP_ID,
    appSecret: env.META_SECRET,
    adAccountId: env.META_AD_ACCOUNT_ID
  });

  return {
    configured: true as const,
    hasAppCredentials: Boolean(env.META_APP_ID && env.META_SECRET),
    report,
    checkedAt: new Date().toISOString()
  };
};
