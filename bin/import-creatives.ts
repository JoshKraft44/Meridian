// Uploads photos/videos from creatives/ to Shopify Files and adds them to the creative library.
// Subfolder names become tags (creatives/elk-sets/IMG_1.jpg -> "elk-sets").
// Re-running is safe: files already imported (same path + size) are skipped.
// npm run creatives:import [-- --dry-run]

import { readdir, readFile, stat, mkdtemp, rm } from 'fs/promises';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { shopifyAdmin } from '../src/lib/server/shopify/admin.ts';
import { createStagedUpload, uploadToStagedTarget, createFileAndWait } from '../src/lib/server/shopify/files.ts';

const ROOT = path.resolve('creatives');
const MAX_EDGE = 3000;
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tif', '.tiff']);
const VIDEO_EXT: Record<string, string> = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/mp4' };

const dryRun = process.argv.includes('--dry-run');
const db = new PrismaClient();
const admin = shopifyAdmin({
  shop: process.env.SHOPIFY_SHOP ?? '',
  clientId: process.env.SHOPIFY_CLIENT_ID ?? '',
  clientSecret: process.env.SHOPIFY_CLIENT_SECRET ?? ''
});

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

function imageSize(file: string): { width: number; height: number } {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file]).toString();
  return {
    width: parseInt(out.match(/pixelWidth: (\d+)/)?.[1] ?? '0'),
    height: parseInt(out.match(/pixelHeight: (\d+)/)?.[1] ?? '0')
  };
}

// Instagram only takes JPEG, so everything gets converted. Long edge capped to keep uploads sane.
function toJpeg(file: string, outDir: string): string {
  const { width, height } = imageSize(file);
  const out = path.join(outDir, path.basename(file, path.extname(file)) + '.jpg');
  const args = ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90'];
  if (Math.max(width, height) > MAX_EDGE) args.push('-Z', String(MAX_EDGE));
  execFileSync('sips', [...args, file, '--out', out], { stdio: 'ignore' });
  return out;
}

async function main() {
  let files: string[];
  try {
    files = await walk(ROOT);
  } catch {
    console.error(`No creatives/ folder at ${ROOT}`);
    process.exit(1);
  }

  const tmp = await mkdtemp(path.join(tmpdir(), 'creatives-'));
  let imported = 0;
  let skipped = 0;

  try {
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const isImage = IMAGE_EXT.has(ext);
      const videoMime = VIDEO_EXT[ext];
      if (!isImage && !videoMime) continue;

      const relPath = path.relative(ROOT, file);
      const originalSize = (await stat(file)).size;
      const tags = path.dirname(relPath).split(path.sep).filter((t) => t && t !== '.');

      const existing = await db.creative.findFirst({ where: { filename: relPath, sizeBytes: originalSize } });
      if (existing) {
        skipped++;
        continue;
      }

      if (dryRun) {
        console.log(`would import ${relPath} ${tags.length ? `[${tags.join(', ')}]` : ''}`);
        continue;
      }

      const uploadPath = isImage ? toJpeg(file, tmp) : file;
      const bytes = new Uint8Array(await readFile(uploadPath));
      const mimeType = isImage ? 'image/jpeg' : videoMime;
      const kind = isImage ? 'IMAGE' : 'VIDEO';
      const uploadName = path.basename(uploadPath);

      process.stdout.write(`${relPath} ... `);
      const target = await createStagedUpload(admin, { filename: uploadName, mimeType, sizeBytes: bytes.length, kind });
      await uploadToStagedTarget(target, bytes, mimeType, uploadName);
      const uploaded = await createFileAndWait(admin, target.resourceUrl, kind, path.basename(relPath, ext));

      await db.creative.create({
        data: {
          kind,
          url: uploaded.url,
          shopifyFileId: uploaded.fileId,
          filename: relPath,
          sizeBytes: originalSize,
          width: uploaded.width,
          height: uploaded.height,
          tags
        }
      });
      imported++;
      console.log('done');
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
    await db.$disconnect();
  }

  console.log(`\n${dryRun ? 'dry run: ' : ''}${imported} imported, ${skipped} already in library`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
