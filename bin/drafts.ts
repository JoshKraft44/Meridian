// Draft posts for review in Marketing -> Posts -> Suggestions.
//   npm run drafts -- list          drafts waiting for review, with any feedback left on them
//   npm run drafts -- history       approved/published suggestions (what landed)
//   npm run drafts -- add file.json  create drafts, or rewrite ones that have a groupId
//
// file.json: [{ groupId?, platforms: ["INSTAGRAM","FACEBOOK"], format: "SINGLE"|"CAROUSEL"|"REEL",
//              media: ["IMG_2046.JPG", ...] (library filenames, in order),
//              caption, suggestedFor: "2026-11-09T10:00" (Edmonton), rationale }]

import { readFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import { PrismaClient, type SocialPlatform, type PostFormat } from '@prisma/client';
import { validatePost } from '../src/lib/creatives.ts';
import { edmontonLocalToDate, formatDateTime } from '../src/lib/utils.ts';

const db = new PrismaClient();

interface DraftInput {
  groupId?: string;
  platforms: SocialPlatform[];
  format: PostFormat;
  media: string[];
  caption: string;
  suggestedFor: string;
  rationale: string;
}

async function list(statuses: ('DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED')[]) {
  const rows = await db.socialPost.findMany({
    where: { suggestedBy: { not: null }, status: { in: statuses } },
    orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
    include: { media: { orderBy: { position: 'asc' }, include: { creative: { select: { filename: true } } } } }
  });

  const seen = new Set<string>();
  for (const r of rows) {
    const key = r.groupId ?? r.id;
    if (seen.has(key)) continue;
    seen.add(key);

    const platforms = rows.filter((x) => (x.groupId ?? x.id) === key).map((x) => x.platform).join('+');
    console.log(`\n[${key}] ${r.status} ${platforms} ${r.format} ${r.scheduledFor ? formatDateTime(r.scheduledFor) : ''}`);
    console.log(`  media: ${r.media.map((m) => m.creative.filename).join(', ')}`);
    console.log(`  caption: ${r.caption.replace(/\n/g, ' ⏎ ')}`);
    if (r.feedback) console.log(`  FEEDBACK: ${r.feedback}`);
    if (r.permalink) console.log(`  ${r.permalink}`);
  }
  if (seen.size === 0) console.log('none');
}

async function add(file: string) {
  const drafts: DraftInput[] = JSON.parse(await readFile(file, 'utf8'));

  for (const d of drafts) {
    const creatives = await db.creative.findMany({ where: { filename: { in: d.media } } });
    const media = d.media.map((name) => creatives.find((c) => c.filename === name));
    if (media.some((m) => !m)) throw new Error(`unknown media in "${d.caption.slice(0, 40)}": ${d.media.join(', ')}`);

    for (const platform of d.platforms) {
      const problem = validatePost({ platform, format: d.format, caption: d.caption, media: media.map((m) => m!) });
      if (problem) throw new Error(`${platform}: ${problem} ("${d.caption.slice(0, 40)}")`);
    }

    const groupId = d.groupId ?? randomUUID();
    const scheduledFor = edmontonLocalToDate(d.suggestedFor);

    // A rewrite replaces the old draft rows; anything already approved is left alone
    if (d.groupId) {
      const locked = await db.socialPost.count({ where: { groupId, status: { not: 'DRAFT' } } });
      if (locked) {
        console.log(`skip ${groupId}: already approved`);
        continue;
      }
      await db.socialPost.deleteMany({ where: { groupId } });
    }

    await db.$transaction(
      d.platforms.map((platform) =>
        db.socialPost.create({
          data: {
            groupId,
            platform,
            format: d.format,
            caption: d.caption,
            status: 'DRAFT',
            scheduledFor,
            suggestedBy: 'claude',
            rationale: d.rationale,
            media: { create: media.map((m, position) => ({ creativeId: m!.id, position })) }
          }
        })
      )
    );
    console.log(`${d.groupId ? 'rewrote' : 'added'} ${groupId}  ${d.suggestedFor}  ${d.caption.split('\n')[0].slice(0, 60)}`);
  }
}

const [cmd, arg] = process.argv.slice(2);

const run =
  cmd === 'list' ? list(['DRAFT'])
  : cmd === 'history' ? list(['SCHEDULED', 'PUBLISHED', 'FAILED'])
  : cmd === 'add' && arg ? add(arg)
  : Promise.reject(new Error('usage: drafts list | history | add <file.json>'));

run
  .catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
