<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import { cdnThumb, formatDateTime } from '$lib/utils';
  import { CAPTION_LIMIT, needsIgCrop, validatePost, type Format, type Platform } from '$lib/creatives';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let instagram = $state(true);
  let facebook = $state(true);
  let format = $state<Format>('SINGLE');
  let selected = $state<string[]>([]);
  let caption = $state('');
  let when = $state<'now' | 'schedule' | 'draft'>('schedule');
  let scheduledAt = $state(defaultScheduleTime());
  let submitting = $state(false);

  // ISO -> value for a datetime-local input, in Edmonton time
  function toEdmontonLocal(iso: string | null) {
    if (!iso) return defaultScheduleTime();
    const d = new Date(iso);
    const day = d.toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' });
    const time = d.toLocaleTimeString('en-GB', { timeZone: 'America/Edmonton', hour: '2-digit', minute: '2-digit' });
    return `${day}T${time}`;
  }

  function platformLabel(platforms: string[]) {
    return platforms.map((p) => (p === 'INSTAGRAM' ? 'Instagram' : 'Facebook')).join(' + ');
  }

  function defaultScheduleTime() {
    const d = new Date(Date.now() + 24 * 60 * 60_000);
    const day = d.toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' });
    return `${day}T09:00`;
  }

  let platforms = $derived([...(instagram ? ['INSTAGRAM'] : []), ...(facebook ? ['FACEBOOK'] : [])] as Platform[]);
  let wantedKind = $derived(format === 'REEL' ? 'VIDEO' : 'IMAGE');
  let pickable = $derived(data.creatives.filter((c) => c.kind === wantedKind));
  let selectedCreatives = $derived(selected.map((id) => data.creatives.find((c) => c.id === id)).filter((c) => c !== undefined));
  let hashtags = $derived(caption.match(/#\w+/g)?.length ?? 0);
  // Errors from suggestion cards show on the card, not here
  let composerError = $derived(form?.error && !('groupId' in form) ? form.error : null);

  let problem = $derived.by(() => {
    if (platforms.length === 0) return 'Pick at least one platform';
    for (const platform of platforms) {
      const p = validatePost({ platform, format, caption, media: selectedCreatives });
      if (p) return p;
    }
    return null;
  });

  function setFormat(f: Format) {
    format = f;
    selected = [];
  }

  function toggle(id: string) {
    if (format !== 'CAROUSEL') {
      selected = selected[0] === id ? [] : [id];
    } else if (selected.includes(id)) {
      selected = selected.filter((s) => s !== id);
    } else if (selected.length < 10) {
      selected = [...selected, id];
    }
  }

  const statusStyle: Record<string, string> = {
    DRAFT: 'text-text-muted',
    SCHEDULED: 'text-text-secondary',
    PUBLISHING: 'text-warning',
    PUBLISHED: 'text-positive',
    FAILED: 'text-negative'
  };

  // Keep the list fresh while something is going out
  const poll = setInterval(() => {
    const soon = Date.now() + 90_000;
    const busy = data.posts.some(
      (p) => p.status === 'PUBLISHING' || (p.status === 'SCHEDULED' && p.scheduledFor && new Date(p.scheduledFor).getTime() < soon)
    );
    if (busy) invalidateAll();
  }, 5000);
  onDestroy(() => clearInterval(poll));
</script>

<svelte:head>
  <title>Posts — Meridian</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
  <div class="px-8 py-6 max-w-5xl mx-auto space-y-6">

    {#if data.suggestions.length}
      <section class="space-y-3">
        <div>
          <h2 class="text-sm font-semibold text-text-primary">Suggestions <span class="text-text-muted font-normal">· {data.suggestions.length} to review</span></h2>
          <p class="text-xs text-text-muted mt-1">Drafted by Claude. Edit and approve, or leave feedback and ask for a rewrite.</p>
        </div>

        {#each data.suggestions as sug (sug.groupId)}
          {@const cropped = sug.platforms.includes('INSTAGRAM')}
          <div class="card p-4 space-y-3">
            <div class="flex items-center gap-2 text-xs">
              <span class="text-text-primary">{platformLabel(sug.platforms)}</span>
              <span class="text-text-muted">· {sug.format.toLowerCase()}{sug.media.length > 1 ? ` (${sug.media.length})` : ''}</span>
              {#if sug.suggestedFor}<span class="text-text-muted">· suggested for {formatDateTime(sug.suggestedFor)}</span>{/if}
            </div>

            <div class="flex gap-2 overflow-x-auto pb-1">
              {#each sug.media as m}
                <div class="shrink-0 w-28 rounded-md overflow-hidden bg-elevated {cropped && m.kind === 'IMAGE' && needsIgCrop(m) ? 'aspect-[4/5]' : ''}">
                  {#if m.kind === 'IMAGE'}
                    <img src={cdnThumb(m.url, 300)} alt="" class="w-full h-full object-cover" />
                  {:else}
                    <video src={m.url} preload="metadata" muted class="w-full"></video>
                  {/if}
                </div>
              {/each}
            </div>

            {#if sug.rationale}
              <p class="text-xs text-text-muted"><span class="text-text-secondary">Why:</span> {sug.rationale}</p>
            {/if}

            <form method="POST" action="?/approveSuggestion" class="space-y-2" use:enhance={() => async ({ update }) => update({ reset: false })}>
              <input type="hidden" name="groupId" value={sug.groupId} />
              <textarea name="caption" rows="6" class="input w-full text-sm resize-y">{sug.caption}</textarea>
              <div class="flex flex-wrap items-center gap-3">
                <input type="datetime-local" name="scheduledAt" value={toEdmontonLocal(sug.suggestedFor)} class="input text-xs" />
                <span class="text-[11px] text-text-muted">Edmonton time</span>
                <button type="submit" class="btn-primary text-xs ml-auto">Approve & schedule</button>
              </div>
              {#if form?.error && 'groupId' in form && form.groupId === sug.groupId}
                <p class="text-xs text-negative">{form.error}</p>
              {/if}
            </form>

            <form method="POST" action="?/suggestionFeedback" class="flex gap-2 items-start" use:enhance={() => async ({ update }) => update({ reset: false })}>
              <input type="hidden" name="groupId" value={sug.groupId} />
              <textarea name="feedback" rows="1" class="input flex-1 text-xs resize-y" placeholder="Feedback for a rewrite (tone, photo swap, timing…)">{sug.feedback ?? ''}</textarea>
              <button type="submit" class="btn-outline text-xs shrink-0">
                {form && 'feedbackSaved' in form && form.feedbackSaved === sug.groupId ? 'Saved' : 'Save feedback'}
              </button>
              <button type="submit" formaction="?/dismissSuggestion" class="text-xs text-negative/80 hover:text-negative shrink-0 py-1.5">Dismiss</button>
            </form>
          </div>
        {/each}
      </section>
    {/if}

    <form
      method="POST"
      action="?/create"
      class="card p-5 space-y-5"
      use:enhance={({ cancel }) => {
        if (when === 'now' && !confirm(`Publish to ${platforms.map((p) => (p === 'INSTAGRAM' ? 'Instagram' : 'Facebook')).join(' and ')} now?`)) {
          cancel();
          return;
        }
        submitting = true;
        return async ({ result, update }) => {
          submitting = false;
          if (result.type === 'success') {
            selected = [];
            caption = '';
          }
          await update({ reset: false });
        };
      }}
    >
      <h2 class="text-sm font-semibold text-text-primary">New post</h2>

      <div class="flex flex-wrap gap-6 text-sm">
        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 text-text-secondary">
            <input type="checkbox" name="platforms" value="INSTAGRAM" bind:checked={instagram} /> Instagram
          </label>
          <label class="flex items-center gap-2 text-text-secondary">
            <input type="checkbox" name="platforms" value="FACEBOOK" bind:checked={facebook} /> Facebook
          </label>
        </div>

        <div class="flex rounded-md border border-border overflow-hidden text-xs">
          {#each [['SINGLE', 'Photo'], ['CAROUSEL', 'Carousel'], ['REEL', 'Reel']] as [value, label]}
            <button
              type="button"
              onclick={() => setFormat(value as Format)}
              class="px-3 py-1.5 transition-colors duration-150 {format === value ? 'bg-elevated text-text-primary' : 'text-text-muted hover:text-text-secondary'}"
            >
              {label}
            </button>
          {/each}
        </div>
        <input type="hidden" name="format" value={format} />
        <input type="hidden" name="creativeIds" value={selected.join(',')} />
      </div>

      <div>
        <p class="text-xs text-text-muted mb-2">
          {format === 'CAROUSEL' ? 'Pick 2–10 photos in order' : format === 'REEL' ? 'Pick a video' : 'Pick a photo'}
          {#if pickable.length === 0}— none in the <a href="/marketing/library" class="underline">library</a> yet{/if}
        </p>
        <div class="grid grid-cols-5 md:grid-cols-8 gap-2 max-h-64 overflow-y-auto pr-1">
          {#each pickable as c (c.id)}
            {@const order = selected.indexOf(c.id)}
            <button
              type="button"
              onclick={() => toggle(c.id)}
              title={c.filename}
              class="relative aspect-square rounded-md overflow-hidden border-2 transition-all duration-150
                {order >= 0 ? 'border-[var(--accent)]' : 'border-transparent opacity-80 hover:opacity-100'}"
            >
              {#if c.kind === 'IMAGE'}
                <img src={cdnThumb(c.url, 200)} alt={c.filename} loading="lazy" class="w-full h-full object-cover" />
              {:else}
                <video src={c.url} preload="metadata" muted class="w-full h-full object-cover"></video>
              {/if}
              {#if order >= 0 && format === 'CAROUSEL'}
                <span class="absolute top-1 left-1 w-5 h-5 rounded-full accent-bg text-[11px] text-white flex items-center justify-center">{order + 1}</span>
              {/if}
            </button>
          {/each}
        </div>
      </div>

      {#if selectedCreatives.length}
        <div class="flex gap-3 overflow-x-auto pb-1">
          {#each selectedCreatives as c}
            {@const cropped = instagram && c.kind === 'IMAGE' && needsIgCrop(c)}
            <div class="shrink-0 w-32 space-y-1">
              <div class="rounded-md overflow-hidden bg-elevated {cropped ? 'aspect-[4/5]' : ''}">
                {#if c.kind === 'IMAGE'}
                  <img src={cdnThumb(c.url, 300)} alt={c.filename} class="w-full {cropped ? 'h-full object-cover' : ''}" />
                {:else}
                  <video src={c.url} preload="metadata" muted class="w-full"></video>
                {/if}
              </div>
              {#if cropped}
                <p class="text-[10px] text-text-muted">Instagram: center-cropped to 4:5</p>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <div class="space-y-1">
        <textarea
          name="caption"
          rows="5"
          bind:value={caption}
          class="input w-full text-sm resize-y"
          placeholder="Caption"
        ></textarea>
        <p class="text-[11px] text-right {caption.length > CAPTION_LIMIT || (instagram && hashtags > 30) ? 'text-negative' : 'text-text-muted'}">
          {caption.length}/{CAPTION_LIMIT}{#if instagram} · {hashtags}/30 hashtags{/if}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-4 text-sm">
        {#each [['schedule', 'Schedule'], ['now', 'Publish now'], ['draft', 'Save draft']] as [value, label]}
          <label class="flex items-center gap-2 text-text-secondary">
            <input type="radio" name="when" {value} bind:group={when} /> {label}
          </label>
        {/each}
        {#if when === 'schedule'}
          <input type="datetime-local" name="scheduledAt" bind:value={scheduledAt} class="input text-xs" />
          <span class="text-[11px] text-text-muted">Edmonton time</span>
        {/if}
      </div>

      <div class="flex items-center justify-between gap-4">
        <p class="text-xs {composerError ? 'text-negative' : 'text-text-muted'}">
          {composerError ?? problem ?? ''}
          {#if !composerError && !problem && form && 'created' in form}
            {form.when === 'draft' ? 'Saved' : form.when === 'now' ? 'Publishing…' : 'Scheduled'}
          {/if}
        </p>
        <button type="submit" class="btn-primary text-xs" disabled={!!problem || submitting}>
          {when === 'now' ? 'Publish now' : when === 'schedule' ? 'Schedule' : 'Save draft'}
        </button>
      </div>
    </form>

    <section class="space-y-3">
      <h2 class="text-sm font-semibold text-text-primary">Posts</h2>
      {#if data.posts.length === 0}
        <p class="text-xs text-text-muted">Nothing posted from Meridian yet.</p>
      {:else}
        <div class="card divide-y divide-border">
          {#each data.posts as p (p.id)}
            <div class="p-4 flex gap-4">
              <div class="w-16 h-16 shrink-0 rounded-md overflow-hidden bg-elevated">
                {#if p.media[0]?.kind === 'IMAGE'}
                  <img src={cdnThumb(p.media[0].url, 160)} alt="" class="w-full h-full object-cover" />
                {:else if p.media[0]}
                  <video src={p.media[0].url} preload="metadata" muted class="w-full h-full object-cover"></video>
                {/if}
              </div>

              <div class="flex-1 min-w-0 space-y-1">
                <div class="flex items-center gap-2 text-xs">
                  <span class="text-text-primary">{p.platform === 'INSTAGRAM' ? 'Instagram' : 'Facebook'}</span>
                  <span class="text-text-muted">· {p.format.toLowerCase()}{p.media.length > 1 ? ` (${p.media.length})` : ''}</span>
                  <span class="{statusStyle[p.status]}">· {p.status.toLowerCase()}</span>
                  <span class="text-text-muted">
                    {#if p.publishedAt}· {formatDateTime(p.publishedAt)}{:else if p.scheduledFor}· {formatDateTime(p.scheduledFor)}{/if}
                  </span>
                </div>
                <p class="text-sm text-text-secondary line-clamp-2 whitespace-pre-line">{p.caption || '(no caption)'}</p>
                {#if p.error}
                  <p class="text-xs text-negative">{p.error}</p>
                {/if}
              </div>

              <div class="flex flex-col items-end gap-1.5 text-xs shrink-0">
                {#if p.permalink}
                  <a href={p.permalink} target="_blank" rel="noreferrer" class="text-text-secondary hover:text-text-primary">View ↗</a>
                {/if}
                {#if p.status === 'DRAFT' || p.status === 'FAILED'}
                  <form method="POST" action="?/publishNow" use:enhance={({ cancel }) => { if (!confirm('Publish this now?')) cancel(); }}>
                    <input type="hidden" name="id" value={p.id} />
                    <button class="text-text-secondary hover:text-text-primary">{p.status === 'FAILED' ? 'Retry' : 'Publish now'}</button>
                  </form>
                {/if}
                {#if p.status === 'SCHEDULED'}
                  <form method="POST" action="?/unschedule" use:enhance>
                    <input type="hidden" name="id" value={p.id} />
                    <button class="text-text-secondary hover:text-text-primary">Unschedule</button>
                  </form>
                {/if}
                {#if p.status === 'DRAFT' || p.status === 'SCHEDULED' || p.status === 'FAILED'}
                  <form method="POST" action="?/delete" use:enhance>
                    <input type="hidden" name="id" value={p.id} />
                    <button class="text-negative/80 hover:text-negative">Delete</button>
                  </form>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</div>
