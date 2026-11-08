import type { AdminGraphql } from './admin';

// Shopify Files is the public host for creatives: Meta fetches media by URL when publishing.
// Flow: staged upload target -> upload bytes -> fileCreate -> poll until READY.

export type FileKind = 'IMAGE' | 'VIDEO';

export interface StagedTarget {
  url: string;
  resourceUrl: string;
  parameters: { name: string; value: string }[];
}

export interface UploadedFile {
  fileId: string;
  url: string;
  width: number | null;
  height: number | null;
}

function firstError(errors: { message: string }[] | undefined): string | null {
  return errors && errors.length > 0 ? errors.map((e) => e.message).join('; ') : null;
}

export async function createStagedUpload(
  admin: AdminGraphql,
  file: { filename: string; mimeType: string; sizeBytes: number; kind: FileKind }
): Promise<StagedTarget> {
  const res = await admin(
    `mutation ($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { message }
      }
    }`,
    {
      input: [
        {
          filename: file.filename,
          mimeType: file.mimeType,
          resource: file.kind,
          fileSize: String(file.sizeBytes),
          httpMethod: 'POST'
        }
      ]
    }
  );

  const err = firstError(res.errors) ?? firstError(res.data?.stagedUploadsCreate?.userErrors);
  if (err) throw new Error(`stagedUploadsCreate: ${err}`);
  return res.data.stagedUploadsCreate.stagedTargets[0];
}

// Server-side upload, used by the import script. The browser posts to the staged URL directly.
export async function uploadToStagedTarget(target: StagedTarget, bytes: Uint8Array<ArrayBuffer>, mimeType: string, filename: string) {
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([bytes], { type: mimeType }), filename);

  const res = await fetch(target.url, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`staged upload failed (${res.status}): ${await res.text()}`);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Videos take a while to process; images are usually ready within a few seconds.
export async function createFileAndWait(
  admin: AdminGraphql,
  resourceUrl: string,
  kind: FileKind,
  alt: string
): Promise<UploadedFile> {
  const created = await admin(
    `mutation ($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id }
        userErrors { message }
      }
    }`,
    { files: [{ originalSource: resourceUrl, contentType: kind, alt }] }
  );

  const err = firstError(created.errors) ?? firstError(created.data?.fileCreate?.userErrors);
  if (err) throw new Error(`fileCreate: ${err}`);
  const fileId: string = created.data.fileCreate.files[0].id;

  const deadline = Date.now() + (kind === 'VIDEO' ? 10 * 60_000 : 60_000);

  while (Date.now() < deadline) {
    const res = await admin(
      `query ($id: ID!) {
        node(id: $id) {
          ... on MediaImage { fileStatus fileErrors { message } image { url width height } }
          ... on Video { fileStatus fileErrors { message } sources { url mimeType width height } }
        }
      }`,
      { id: fileId }
    );
    const node = res.data?.node;

    if (node?.fileStatus === 'FAILED') {
      throw new Error(`shopify file processing failed: ${firstError(node.fileErrors) ?? 'unknown'}`);
    }

    if (node?.fileStatus === 'READY') {
      if (kind === 'IMAGE' && node.image) {
        return { fileId, url: node.image.url, width: node.image.width, height: node.image.height };
      }
      // Pick the largest mp4 rendition; Meta needs a direct mp4 link for Reels
      const mp4s = (node.sources ?? []).filter((s: { mimeType: string }) => s.mimeType === 'video/mp4');
      const best = mp4s.sort((a: { width: number }, b: { width: number }) => b.width - a.width)[0];
      if (best) return { fileId, url: best.url, width: best.width, height: best.height };
    }

    await sleep(kind === 'VIDEO' ? 5000 : 1500);
  }

  throw new Error(`timed out waiting for shopify to process ${fileId}`);
}

export async function deleteFile(admin: AdminGraphql, fileId: string) {
  const res = await admin(
    `mutation ($ids: [ID!]!) { fileDelete(fileIds: $ids) { userErrors { message } } }`,
    { ids: [fileId] }
  );
  const err = firstError(res.errors) ?? firstError(res.data?.fileDelete?.userErrors);
  if (err) throw new Error(`fileDelete: ${err}`);
}
