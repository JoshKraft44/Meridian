// Shared by the composer (preview + validation) and the publisher, so both apply the same rules.

export const CAPTION_LIMIT = 2200;
export const IG_HASHTAG_LIMIT = 30;

// Instagram feed only accepts 4:5 portrait up to 1.91:1 landscape
const IG_MIN_RATIO = 0.8;
const IG_MAX_RATIO = 1.91;

interface Sized {
  url: string;
  width: number | null;
  height: number | null;
}

export function needsIgCrop(c: Sized): boolean {
  if (!c.width || !c.height) return false;
  const ratio = c.width / c.height;
  return ratio < IG_MIN_RATIO || ratio > IG_MAX_RATIO;
}

// Instagram stores feed photos at 1080px wide, so anything over 1440 is wasted download time
const IG_MAX_WIDTH = 1440;

// Shopify's CDN can center-crop and resize on the fly, so originals stay untouched.
// format=pjpg forces JPEG: the CDN serves WebP to clients that accept it, and Instagram rejects WebP.
export function igSafeUrl(c: Sized): string {
  const params = ['format=pjpg'];

  if (c.width && c.height) {
    let width = c.width;
    let height = c.height;
    if (needsIgCrop(c)) {
      if (width / height < IG_MIN_RATIO) height = Math.floor(width / IG_MIN_RATIO);
      else width = Math.floor(height * IG_MAX_RATIO);
    }
    if (width > IG_MAX_WIDTH) {
      height = Math.round((height * IG_MAX_WIDTH) / width);
      width = IG_MAX_WIDTH;
    }
    if (width !== c.width || height !== c.height) params.unshift(`width=${width}`, `height=${height}`, 'crop=center');
  }

  return `${c.url}${c.url.includes('?') ? '&' : '?'}${params.join('&')}`;
}

export type Platform = 'INSTAGRAM' | 'FACEBOOK';
export type Format = 'SINGLE' | 'CAROUSEL' | 'REEL';

export function validatePost(post: {
  platform: Platform;
  format: Format;
  caption: string;
  media: { kind: 'IMAGE' | 'VIDEO' }[];
}): string | null {
  const images = post.media.filter((m) => m.kind === 'IMAGE').length;
  const videos = post.media.length - images;

  if (post.caption.length > CAPTION_LIMIT) return `Caption is over ${CAPTION_LIMIT} characters`;
  if (post.platform === 'INSTAGRAM') {
    const hashtags = post.caption.match(/#\w+/g)?.length ?? 0;
    if (hashtags > IG_HASHTAG_LIMIT) return `Instagram allows ${IG_HASHTAG_LIMIT} hashtags (caption has ${hashtags})`;
  }

  if (post.format === 'SINGLE' && (images !== 1 || videos > 0)) return 'A single post needs exactly one photo';
  if (post.format === 'CAROUSEL' && (images < 2 || images > 10 || videos > 0)) return 'A carousel needs 2–10 photos';
  if (post.format === 'REEL' && (videos !== 1 || images > 0)) return 'A reel needs exactly one video';

  return null;
}
