<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  type Media = { id: string; alt: string | null; url: string; width: number; height: number };
  type Preset = { id: string; name: string; description: string; prompt: string; builtIn: boolean };
  type Generated = { id: string; presetName: string; model: string; status: string; creativeId: string | null; createdAt: string };
  type Pending = { tempId: string; presetName: string; error?: string };
  type Count = 'one' | 'pair' | 'set';

  let productId = $derived($page.url.searchParams.get('id'));

  // Product picker
  let query = $state('');
  let products = $state<{ id: string; title: string; image: string | null; photos: number }[]>([]);
  let loadingProducts = $state(false);

  // Open product
  let product = $state<{ id: string; title: string; media: Media[] } | null>(null);
  let presets = $state<Preset[]>([]);
  let generated = $state<Generated[]>([]);
  let pending = $state<Pending[]>([]);
  let loadError = $state('');

  let view = $state<'single' | 'grid'>('single');
  let sourceIndex = $state(0);
  let showing = $state<{ kind: 'media'; index: number } | { kind: 'generated'; id: string }>({ kind: 'media', index: 0 });

  let count = $state<Count>('one');
  let model = $state<'fast' | 'best'>('fast');
  let aspectRatio = $state('4:5');
  let useReferences = $state(true);

  // Edits made with "Use for this session" live here and are gone when the page closes
  let sessionPrompts = $state<Record<string, string>>({});
  let editing = $state<Preset | null>(null);
  let editorText = $state('');
  let saveName = $state('');
  let notice = $state('');

  let source = $derived(product?.media[sourceIndex] ?? null);
  let mainImage = $derived.by(() => {
    if (!product) return null;
    if (showing.kind === 'generated') {
      const id = showing.id;
      return { url: `/studio/image/${id}`, label: generated.find((g) => g.id === id)?.presetName ?? 'Generated' };
    }
    const m = product.media[showing.index];
    return m ? { url: sized(m.url, 2000), label: `Photo ${showing.index + 1} of ${product.media.length}` } : null;
  });

  function sized(url: string, width: number) {
    return `${url}${url.includes('?') ? '&' : '?'}width=${width}`;
  }

  // Keep Shopify's host/shop params when switching products so a reload stays embedded
  function openProduct(id: string | null) {
    const params = new URLSearchParams($page.url.search);
    if (id) params.set('id', id);
    else params.delete('id');
    goto(`?${params}`, { keepFocus: true });
  }

  async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init?.body ? { ...init, headers: { 'Content-Type': 'application/json' } } : init);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message ?? `Request failed (${res.status})`);
    }
    return res.json();
  }

  async function searchProducts() {
    loadingProducts = true;
    try {
      products = await api(`/studio/api/products?q=${encodeURIComponent(query)}`);
    } catch (err) {
      loadError = (err as Error).message;
    } finally {
      loadingProducts = false;
    }
  }

  async function loadProduct(id: string) {
    loadError = '';
    product = null;
    try {
      const data = await api<{ product: typeof product; presets: Preset[]; generated: Generated[]; defaultCount: Count }>(
        `/studio/api/product?id=${encodeURIComponent(id)}`
      );
      product = data.product;
      presets = data.presets;
      generated = data.generated;
      count = data.defaultCount;
      sourceIndex = 0;
      showing = { kind: 'media', index: 0 };
    } catch (err) {
      loadError = (err as Error).message;
    }
  }

  $effect(() => {
    if (productId) loadProduct(productId);
    else searchProducts();
  });

  function selectMedia(index: number) {
    sourceIndex = index;
    showing = { kind: 'media', index };
    view = 'single';
  }

  function step(delta: number) {
    if (!product?.media.length) return;
    selectMedia((sourceIndex + delta + product.media.length) % product.media.length);
  }

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea')) return;
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function promptFor(p: Preset) {
    return sessionPrompts[p.id] ?? p.prompt;
  }

  async function generate(presetName: string, prompt: string) {
    if (!product || !source) return;

    const others = product.media.filter((m) => m.id !== source!.id).slice(0, 2);
    const sourceMediaIds = [source.id, ...(useReferences ? others.map((m) => m.id) : [])];
    const tempId = crypto.randomUUID();
    pending = [{ tempId, presetName }, ...pending];

    try {
      const image = await api<Generated>('/studio/api/generate', {
        method: 'POST',
        body: JSON.stringify({ productId: product.id, sourceMediaIds, presetName, prompt, count, model, aspectRatio })
      });
      pending = pending.filter((p) => p.tempId !== tempId);
      generated = [image, ...generated];
    } catch (err) {
      pending = pending.map((p) => (p.tempId === tempId ? { ...p, error: (err as Error).message } : p));
    }
  }

  function openEditor(p: Preset) {
    editing = p;
    editorText = promptFor(p);
    saveName = p.name.replace(/ · .*$/, '');
  }

  function useForSession() {
    if (!editing) return;
    sessionPrompts = { ...sessionPrompts, [editing.id]: editorText };
    notice = `"${editing.name}" uses your edit until you leave this page`;
    editing = null;
  }

  function resetEdit() {
    if (!editing) return;
    const { [editing.id]: _, ...rest } = sessionPrompts;
    sessionPrompts = rest;
    editorText = editing.prompt;
  }

  async function saveAsPreset() {
    if (!editing) return;
    try {
      const preset = await api<Preset>('/studio/api/presets', {
        method: 'POST',
        body: JSON.stringify({ name: saveName || editing.name, description: editing.description, prompt: editorText })
      });
      presets = [...presets, preset];
      notice = `Saved as "${preset.name}"`;
      editing = null;
    } catch (err) {
      notice = (err as Error).message;
    }
  }

  async function removePreset(p: Preset) {
    try {
      await api(`/studio/api/presets/${p.id}`, { method: 'DELETE' });
      presets = presets.filter((x) => x.id !== p.id);
    } catch (err) {
      notice = (err as Error).message;
    }
  }

  let working = $state<Record<string, string>>({});

  async function act(img: Generated, action: 'add' | 'library' | 'discard') {
    working = { ...working, [img.id]: action };
    try {
      const updated = await api<Generated>(`/studio/api/images/${img.id}`, {
        method: 'POST',
        body: JSON.stringify({ action, alt: `${product?.title ?? ''} – ${img.presetName}` })
      });
      if (action === 'discard') {
        generated = generated.filter((g) => g.id !== img.id);
        if (showing.kind === 'generated' && showing.id === img.id) showing = { kind: 'media', index: sourceIndex };
      } else {
        generated = generated.map((g) => (g.id === img.id ? updated : g));
      }
      // Added images show up in the product's photo list on the next load
      if (action === 'add' && product) notice = 'Added to the product. Reload to see it in the photo list.';
    } catch (err) {
      notice = (err as Error).message;
    } finally {
      const { [img.id]: _, ...rest } = working;
      working = rest;
    }
  }
</script>

<svelte:head>
  <title>Image studio — Meridian</title>
</svelte:head>

<div class="min-h-screen bg-base text-text-primary">
  {#if !productId}
    <div class="max-w-5xl mx-auto px-6 py-6 space-y-5">
      <div class="flex items-center justify-between gap-4">
        <h1 class="text-xl font-semibold">Image studio</h1>
        <form class="flex gap-2" onsubmit={(e) => { e.preventDefault(); searchProducts(); }}>
          <input class="input text-sm w-72" placeholder="Search products" bind:value={query} />
          <button class="btn-outline text-xs">Search</button>
        </form>
      </div>
      {#if loadError}<p class="text-sm text-negative">{loadError}</p>{/if}
      {#if loadingProducts}
        <p class="text-sm text-text-muted">Loading…</p>
      {:else}
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {#each products as p (p.id)}
            <button class="card overflow-hidden text-left hover:shadow-card-hover transition-all duration-150" onclick={() => openProduct(p.id)}>
              <div class="aspect-square bg-elevated">
                {#if p.image}<img src={sized(p.image, 500)} alt="" class="w-full h-full object-cover" loading="lazy" />{/if}
              </div>
              <div class="p-3">
                <p class="text-sm text-text-secondary line-clamp-2">{p.title}</p>
                <p class="text-xs text-text-muted mt-1">{p.photos} photos</p>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {:else if loadError}
    <div class="max-w-xl mx-auto px-6 py-10 space-y-3">
      <p class="text-sm text-negative">{loadError}</p>
      <button class="btn-outline text-xs" onclick={() => openProduct(null)}>Back to products</button>
    </div>
  {:else if !product}
    <p class="px-6 py-10 text-sm text-text-muted">Loading product…</p>
  {:else}
    <div class="px-6 py-5 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6">
      <!-- Photos -->
      <section class="space-y-4 min-w-0">
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <button class="text-xs text-text-muted hover:text-text-secondary" onclick={() => openProduct(null)}>← All products</button>
            <h1 class="text-lg font-semibold truncate">{product.title}</h1>
          </div>
          <div class="flex rounded-md border border-border overflow-hidden text-xs shrink-0">
            <button class="px-3 py-1.5 {view === 'single' ? 'bg-elevated text-text-primary' : 'text-text-muted'}" onclick={() => (view = 'single')}>Large</button>
            <button class="px-3 py-1.5 {view === 'grid' ? 'bg-elevated text-text-primary' : 'text-text-muted'}" onclick={() => (view = 'grid')}>All photos</button>
          </div>
        </div>

        {#if product.media.length === 0}
          <p class="text-sm text-text-muted">This product has no photos yet.</p>
        {:else if view === 'grid'}
          <div class="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {#each product.media as m, i (m.id)}
              <button class="relative rounded-lg overflow-hidden bg-elevated border-2 {i === sourceIndex ? 'border-[var(--accent)]' : 'border-transparent'}" onclick={() => selectMedia(i)}>
                <img src={sized(m.url, 900)} alt={m.alt ?? ''} class="w-full aspect-square object-contain" loading="lazy" />
                <span class="absolute top-2 left-2 text-[11px] px-1.5 py-0.5 rounded bg-black/60 text-white">{i + 1}</span>
              </button>
            {/each}
          </div>
        {:else if mainImage}
          <div class="relative rounded-lg bg-elevated overflow-hidden">
            <img src={mainImage.url} alt="" class="w-full h-[68vh] object-contain" />
            <span class="absolute top-3 left-3 text-xs px-2 py-1 rounded bg-black/60 text-white">{mainImage.label}</span>
            {#if showing.kind === 'media'}
              <button class="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white text-lg" onclick={() => step(-1)} aria-label="Previous photo">‹</button>
              <button class="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white text-lg" onclick={() => step(1)} aria-label="Next photo">›</button>
            {/if}
          </div>
          <div class="flex gap-2 overflow-x-auto pb-1">
            {#each product.media as m, i (m.id)}
              <button class="shrink-0 w-24 h-24 rounded-md overflow-hidden border-2 transition-all duration-150 {showing.kind === 'media' && showing.index === i ? 'border-[var(--accent)]' : 'border-transparent opacity-75 hover:opacity-100'}" onclick={() => selectMedia(i)}>
                <img src={sized(m.url, 240)} alt="" class="w-full h-full object-cover" loading="lazy" />
              </button>
            {/each}
          </div>
        {/if}

        <!-- Results -->
        {#if pending.length || generated.length}
          <div class="space-y-3 pt-2">
            <h2 class="text-sm font-semibold">Generated</h2>
            <div class="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {#each pending as p (p.tempId)}
                <div class="card p-3 space-y-2">
                  <div class="aspect-[4/5] rounded-md bg-elevated flex items-center justify-center text-xs {p.error ? 'text-negative p-3 text-center' : 'text-text-muted animate-pulse'}">
                    {p.error ?? 'Generating…'}
                  </div>
                  <div class="flex justify-between text-xs">
                    <span class="text-text-secondary truncate">{p.presetName}</span>
                    {#if p.error}<button class="text-text-muted hover:text-text-secondary" onclick={() => (pending = pending.filter((x) => x.tempId !== p.tempId))}>Dismiss</button>{/if}
                  </div>
                </div>
              {/each}
              {#each generated as g (g.id)}
                <div class="card p-3 space-y-2">
                  <button class="block w-full rounded-md overflow-hidden bg-elevated" onclick={() => { showing = { kind: 'generated', id: g.id }; view = 'single'; window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                    <img src="/studio/image/{g.id}" alt={g.presetName} class="w-full aspect-[4/5] object-cover" loading="lazy" />
                  </button>
                  <p class="text-xs text-text-secondary truncate">{g.presetName} <span class="text-text-muted">· {g.model === 'best' ? 'Pro' : 'Fast'}</span></p>
                  <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {#if g.status === 'ADDED'}
                      <span class="text-positive">On product</span>
                    {:else}
                      <button class="text-text-primary hover:underline disabled:opacity-50" disabled={!!working[g.id]} onclick={() => act(g, 'add')}>{working[g.id] === 'add' ? 'Adding…' : 'Add to product'}</button>
                    {/if}
                    {#if g.creativeId}
                      <span class="text-positive">In library</span>
                    {:else}
                      <button class="text-text-secondary hover:underline disabled:opacity-50" disabled={!!working[g.id]} onclick={() => act(g, 'library')}>{working[g.id] === 'library' ? 'Saving…' : 'Save to library'}</button>
                    {/if}
                    {#if g.status !== 'ADDED'}
                      <button class="text-negative/80 hover:text-negative disabled:opacity-50" disabled={!!working[g.id]} onclick={() => act(g, 'discard')}>Discard</button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </section>

      <!-- Generate -->
      <aside class="space-y-4 xl:sticky xl:top-5 self-start">
        <div class="card p-4 space-y-4">
          <div class="flex gap-3 items-center">
            {#if source}<img src={sized(source.url, 160)} alt="" class="w-14 h-14 rounded-md object-cover" />{/if}
            <div class="text-xs">
              <p class="text-text-secondary">From photo {sourceIndex + 1} of {product.media.length}</p>
              <label class="flex items-center gap-1.5 text-text-muted mt-1">
                <input type="checkbox" bind:checked={useReferences} /> Also send other angles
              </label>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2 text-xs">
            {#each [['one', 'Single'], ['pair', 'Pair'], ['set', 'Set']] as [value, label]}
              <button class="py-1.5 rounded-md border {count === value ? 'border-[var(--accent)] text-text-primary' : 'border-border text-text-muted'}" onclick={() => (count = value as Count)}>{label}</button>
            {/each}
          </div>
          <div class="flex gap-2 text-xs">
            <select class="input text-xs flex-1" bind:value={model}>
              <option value="fast">Fast (Nano Banana 2)</option>
              <option value="best">Best (Nano Banana Pro)</option>
            </select>
            <select class="input text-xs" bind:value={aspectRatio}>
              <option value="4:5">4:5</option>
              <option value="1:1">1:1</option>
              <option value="3:4">3:4</option>
            </select>
          </div>
        </div>

        {#if notice}
          <p class="text-xs text-text-secondary">{notice}</p>
        {/if}

        <div class="space-y-2">
          {#each presets as p (p.id)}
            <div class="card p-3 flex gap-3 items-start">
              <button class="flex-1 text-left disabled:opacity-50" disabled={!source} onclick={() => generate(p.name, promptFor(p))}>
                <p class="text-sm text-text-primary">
                  {p.name}
                  {#if sessionPrompts[p.id]}<span class="text-[10px] ml-1 px-1.5 py-0.5 rounded bg-elevated text-warning">edited</span>{/if}
                </p>
                <p class="text-xs text-text-muted mt-0.5">{p.description}</p>
              </button>
              <div class="flex flex-col items-end gap-1 text-[11px]">
                <button class="text-text-muted hover:text-text-secondary" onclick={() => openEditor(p)}>Customize</button>
                {#if !p.builtIn}<button class="text-negative/70 hover:text-negative" onclick={() => removePreset(p)}>Remove</button>{/if}
              </div>
            </div>
          {/each}
        </div>

        {#if editing}
          <div class="card p-4 space-y-3">
            <div class="flex justify-between items-center">
              <p class="text-sm font-semibold">{editing.name}</p>
              <button class="text-xs text-text-muted" onclick={() => (editing = null)}>Close</button>
            </div>
            <textarea class="input w-full text-xs font-mono leading-relaxed" rows="14" bind:value={editorText}></textarea>
            <p class="text-[11px] text-text-muted">&#123;antlers&#125; is filled in from Single / Pair / Set.</p>
            <div class="flex flex-wrap gap-2">
              <button class="btn-primary text-xs" onclick={() => { const e = editing!; generate(`${e.name} (edited)`, editorText); }}>Generate with this</button>
              <button class="btn-outline text-xs" onclick={useForSession}>Use for this session</button>
              <button class="text-xs text-text-muted hover:text-text-secondary" onclick={resetEdit}>Reset</button>
            </div>
            <div class="flex gap-2 pt-1 border-t border-border">
              <input class="input text-xs flex-1 mt-3" placeholder="Name" bind:value={saveName} />
              <button class="btn-outline text-xs mt-3" onclick={saveAsPreset}>Save as new preset</button>
            </div>
          </div>
        {/if}
      </aside>
    </div>
  {/if}
</div>
