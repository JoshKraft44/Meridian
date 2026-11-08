// Quick Meta access check without the app running. Never prints the token.
// npm run meta:check

import { checkMetaConnection } from '../src/lib/server/meta/connection.ts';

const token = process.env.META_ACCESS_TOKEN;
if (!token) {
  console.error('META_ACCESS_TOKEN not set');
  process.exit(1);
}

const r = await checkMetaConnection({
  token,
  appId: process.env.META_APP_ID,
  appSecret: process.env.META_SECRET,
  adAccountId: process.env.META_AD_ACCOUNT_ID
});

const fail = (label: string, e: { kind: string; message: string; code: number | null }) =>
  console.log(`  ✗ ${label}: [${e.kind}${e.code ? ` ${e.code}` : ''}] ${e.message}`);

console.log('\nToken');
if (r.tokenInfo.ok && r.tokenInfo.data) {
  const t = r.tokenInfo.data;
  const expiry = t.expires_at === 0 ? 'never expires' : `expires ${new Date(t.expires_at * 1000).toISOString()}`;
  console.log(`  ${t.is_valid ? '✓' : '✗'} ${t.type} for app ${t.application ?? t.app_id}, ${expiry}`);
  for (const g of t.granular_scopes ?? []) {
    if (g.target_ids?.length) console.log(`    ${g.scope} → ${g.target_ids.join(', ')}`);
  }
} else if (!r.tokenInfo.ok) fail('debug_token', r.tokenInfo.error);
else console.log('  (no META_APP_ID/META_SECRET, skipped debug_token)');

if (r.me.ok) console.log(`  ✓ /me: ${r.me.data.name} (${r.me.data.id})`);
else fail('/me', r.me.error);

console.log('\nCapabilities');
for (const c of r.capabilities) {
  const mark = c.granted === null ? '?' : c.granted ? '✓' : '✗';
  console.log(`  ${mark} ${c.label}${c.missing.length ? `  (missing ${c.missing.join(', ')})` : ''}`);
}

console.log('\nPages');
if (!r.pages.ok) fail('/me/accounts', r.pages.error);
else if (r.pages.data.length === 0) console.log('  ✗ none visible');
else
  for (const p of r.pages.data) {
    const ig = p.instagram_business_account;
    console.log(`  ✓ ${p.name} (${p.id})  tasks: ${p.tasks?.join(',') ?? '—'}`);
    console.log(ig ? `    IG @${ig.username} (${ig.id})` : '    ✗ no IG business account visible');
  }

console.log('\nAd account');
if (!r.adAccount) console.log('  (META_AD_ACCOUNT_ID not set)');
else if (!r.adAccount.ok) fail('ad account', r.adAccount.error);
else {
  const a = r.adAccount.data;
  console.log(`  ✓ ${a.name} (${a.id}) status=${a.account_status} ${a.currency} ${a.timezone_name}`);
}
if (r.adSpend7d?.ok) {
  const s = r.adSpend7d.data;
  console.log(`  ✓ insights 7d: $${(s.spendCents / 100).toFixed(2)} spend, ${s.impressions} impr, ${s.clicks} clicks`);
} else if (r.adSpend7d) fail('insights', r.adSpend7d.error);
console.log();
