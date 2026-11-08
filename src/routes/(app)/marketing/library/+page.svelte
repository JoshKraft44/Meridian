<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { cdnThumb } from '$lib/utils';
  import { needsIgCrop } from '$lib/creatives';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const MAX_EDGE = 3000;

  let uploadTags = $state('');
  let uploads = $state<{ name: string; status: string; failed?: boolean }[]>([]);
  let uploading = $derived(uploads.some((u) => !u.failed && u.status !== 'done'));
  let filter = $state('');

  let filtered = $derived(
    filter.trim()
      ? data.creatives.filter((c) =>
          [c.filename, c.notes ?? '', ...c.tags].join(' ').toLowerCase().includes(filter.trim().toLowerCase())
        )
      : data.creatives
  );

  // Instagram only takes JPEG. Converting in the browser also handles HEIC on Safari.
  async function toJpeg(file: File): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (file.type === 'image/jpeg' && scale === 1) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG conversion failed'))), 'image/jpeg', 0.9)
    );
  }

  async function uploadOne(file: File, index: number) {
    const set = (status: string, failed = false) => (uploads[index] = { name: file.name, status, failed });

    try {
      const isVideo = file.type.startsWith('video/');
      set(isVideo ? 'preparing' : 'converting');
      const blob = isVideo ? file : await toJpeg(file);
      const filename = isVideo ? file.name : file.name.replace(/\.[^.]+$/, '') + '.jpg';
      const mimeType = isVideo ? file.type || 'video/mp4' : 'image/jpeg';

      const stagedRes = await fetch('/api/creatives/staged', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, mimeType, sizeBytes: blob.size })
      });
      if (!stagedRes.ok) throw new Error(await stagedRes.text());
      const { target, kind } = await stagedRes.json();

      set('uploading');
      const body = new FormData();
      for (const p of target.parameters) body.append(p.name, p.value);
      body.append('file', blob, filename);
      const up = await fetch(target.url, { method: 'POST', body });
      if (!up.ok) throw new Error(`upload failed (${up.status})`);

      set(isVideo ? 'processing video (can take a minute)' : 'processing');
      const tags = uploadTags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
      const created = await fetch('/api/creatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceUrl: target.resourceUrl, filename, kind, sizeBytes: blob.size, tags })
      });
      if (!created.ok) throw new Error(await created.text());
      set('done');
    } catch (err) {
      set((err as Error).message || 'failed', true);
    }
  }

  async function onFiles(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;

    uploads = files.map((f) => ({ name: f.name, status: 'queued' }));
    // One at a time keeps memory down when converting big photos
    for (let i = 0; i < files.length; i++) await uploadOne(files[i], i);
    await invalidateAll();
  }
</script>

<svelte:head>
  <title>Library — Meridian</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
  <div class="px-8 py-6 max-w-5xl mx-auto space-y-6">

    <section class="card p-5 space-y-3">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h2 class="text-sm font-semibold text-text-primary">Add photos & videos</h2>
          <p class="text-xs text-text-muted mt-1">
            Stored in Shopify Files. Photos are converted to JPEG. Bulk import from the repo: <code class="text-text-secondary">npm run creatives:import</code>
          </p>
        </div>
        <label class="btn-outline text-xs cursor-pointer shrink-0 {uploading ? 'opacity-50 pointer-events-none' : ''}">
          Choose files
          <input type="file" multiple accept="image/*,video/mp4,video/quicktime" class="hidden" onchange={onFiles} />
        </label>
      </div>
      <input class="input text-xs w-full" placeholder="Tags for this batch, comma separated (e.g. elk, matching-set)" bind:value={uploadTags} />

      {#if uploads.length}
        <ul class="text-xs space-y-1">
          {#each uploads as u}
            <li class="flex justify-between gap-4">
              <span class="text-text-secondary truncate">{u.name}</span>
              <span class={u.failed ? 'text-negative' : u.status === 'done' ? 'text-positive' : 'text-text-muted'}>{u.status}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    {#if form?.error}
      <p class="text-xs text-negative">{form.error}</p>
    {/if}

    <div class="flex items-center justify-between gap-4">
      <p class="text-xs text-text-muted">{filtered.length} of {data.creatives.length} creatives</p>
      <input class="input text-xs w-64" placeholder="Filter by name, tag or note" bind:value={filter} />
    </div>

    {#if data.creatives.length === 0}
      <p class="text-sm text-text-muted">Nothing here yet.</p>
    {:else}
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {#each filtered as c (c.id)}
          <div class="card overflow-hidden flex flex-col">
            <div class="aspect-square bg-elevated relative">
              {#if c.kind === 'IMAGE'}
                <img src={cdnThumb(c.url, 500)} alt={c.filename} loading="lazy" class="w-full h-full object-cover" />
              {:else}
                <!-- svelte-ignore a11y_media_has_caption -->
                <video src={c.url} preload="metadata" muted class="w-full h-full object-cover"></video>
                <span class="absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white">VIDEO</span>
              {/if}
              {#if c.kind === 'IMAGE' && needsIgCrop(c)}
                <span class="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white" title="Instagram feed is 4:5 at most; this gets a center crop when posted there">IG crops to 4:5</span>
              {/if}
            </div>

            <form method="POST" action="?/update" use:enhance={() => async ({ update }) => update({ reset: false })} class="p-3 space-y-2 flex-1 flex flex-col">
              <input type="hidden" name="id" value={c.id} />
              <p class="text-xs text-text-secondary truncate" title={c.filename}>{c.filename}</p>
              <p class="text-[11px] text-text-muted">
                {c.width}×{c.height}{#if c.postCount} · in {c.postCount} post{c.postCount > 1 ? 's' : ''}{/if}
              </p>
              <input name="tags" class="input text-xs w-full" placeholder="tags" value={c.tags.join(', ')} />
              <textarea name="notes" rows="2" class="input text-xs w-full resize-none" placeholder="Notes, caption ideas">{c.notes ?? ''}</textarea>
              <div class="flex items-center justify-between mt-auto pt-1">
                <button type="submit" class="text-xs text-text-secondary hover:text-text-primary transition-colors duration-150">
                  {form && 'saved' in form && form.saved === c.id ? 'Saved' : 'Save'}
                </button>
                {#if c.postCount === 0}
                  <button
                    type="submit"
                    formaction="?/delete"
                    class="text-xs text-negative/80 hover:text-negative transition-colors duration-150"
                  >
                    Delete
                  </button>
                {/if}
              </div>
            </form>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
