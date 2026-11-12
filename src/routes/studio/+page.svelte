<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import CompareView, { type CompareItem } from './CompareView.svelte';

  type Media = { id: string; alt: string | null; url: string; width: number; height: number };
  type Preset = { id: string; name: string; description: string; prompt: string; builtIn: boolean };
  type Generated = {
    id: string;
    presetName: string;
    model: string;
    imageSize: string;
    sourceMediaIds: string[];
    status: string;
    creativeId: string | null;
    parentId: string | null;
    instruction: string | null;
    createdAt: string;
  };
  type Pending = { tempId: string; presetName: string; error?: string };
  type Count = 'one' | 'pair' | 'set';

  let productId = $derived($page.url.searchParams.get('id'));

  // Product picker
  type ProductCard = {
    id: string;
    title: string;
    status: string;
    image: string | null;
    photos: number;
    updatedAt: string;
    viewedAt: string | null;
    editedAt: string | null;
  };
  type Sort = 'updated' | 'viewed' | 'edited' | 'created' | 'title';
  const SORTS: { value: Sort; label: string }[] = [
    { value: 'updated', label: 'Updated in Shopify' },
    { value: 'viewed', label: 'Viewed in studio' },
    { value: 'edited', label: 'Edited in studio' },
    { value: 'created', label: 'Newest listings' },
    { value: 'title', label: 'Title A–Z' }
  ];

  let query = $state('');
  let filters = $state({ sort: 'updated' as Sort, collection: '', type: '', status: 'active' });
  let catalog = $state<{ collections: { id: string; title: string; count: number }[]; types: string[] }>({ collections: [], types: [] });
  let products = $state<ProductCard[]>([]);
  let nextCursor = $state<string | null>(null);
  let loadingProducts = $state(false);
  let loadingMore = $state(false);

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
  const QUALITIES = [
    { value: 'fast-1K', label: 'Fast · 1K', hint: '~8s, quick drafts' },
    { value: 'fast-2K', label: 'Fast · 2K', hint: '~14s' },
    { value: 'best-2K', label: 'Best · 2K', hint: '~19s, Nano Banana Pro' },
    { value: 'best-4K', label: 'Best · 4K', hint: '~30s, largest files' }
  ];
  // Remembered per browser so it doesn't fall back to Fast every visit
  let quality = $state('best-2K');
  let model = $derived(quality.split('-')[0] as 'fast' | 'best');
  let imageSize = $derived(quality.split('-')[1]);

  onMount(() => {
    try {
      const saved = localStorage.getItem('studio-quality');
      if (saved && QUALITIES.some((q) => q.value === saved)) quality = saved;
    } catch {
      // storage blocked inside some embedded frames; default is fine
    }
  });

  function setQuality(value: string) {
    quality = value;
    try {
      localStorage.setItem('studio-quality', value);
    } catch {
      // ignore
    }
  }
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

  function productsUrl(after?: string) {
    const params = new URLSearchParams({ q: query, ...filters });
    if (after) params.set('after', after);
    return `/studio/api/products?${params}`;
  }

  async function searchProducts() {
    loadingProducts = true;
    loadError = '';
    try {
      localStorage.setItem('studio-filters', JSON.stringify(filters));
    } catch {}
    try {
      const data = await api<{ products: ProductCard[]; next: string | null }>(productsUrl());
      products = data.products;
      nextCursor = data.next;
    } catch (err) {
      loadError = (err as Error).message;
    } finally {
      loadingProducts = false;
    }
  }

  async function loadMoreProducts() {
    if (!nextCursor) return;
    loadingMore = true;
    try {
      const data = await api<{ products: ProductCard[]; next: string | null }>(productsUrl(nextCursor));
      products = [...products, ...data.products];
      nextCursor = data.next;
    } catch (err) {
      loadError = (err as Error).message;
    } finally {
      loadingMore = false;
    }
  }

  async function loadCatalog() {
    if (catalog.collections.length) return;
    try {
      catalog = await api('/studio/api/catalog');
    } catch {
      // Filters just stay empty; search and sorting still work
    }
  }

  function setFilter(key: keyof typeof filters, value: string) {
    filters = { ...filters, [key]: value };
    searchProducts();
  }

  function ago(iso: string | null) {
    if (!iso) return null;
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // The time shown on each card follows the sort, falling back to Shopify's update time
  function cardTime(p: ProductCard) {
    if (filters.sort === 'viewed' && p.viewedAt) return `Viewed ${ago(p.viewedAt)}`;
    if (filters.sort === 'edited' && p.editedAt) return `Edited ${ago(p.editedAt)}`;
    return `Updated ${ago(p.updatedAt)}`;
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

  try {
    const saved = JSON.parse(localStorage.getItem('studio-filters') ?? 'null');
    if (saved) filters = { ...filters, ...saved };
  } catch {}

  $effect(() => {
    if (productId) loadProduct(productId);
    else {
      searchProducts();
      loadCatalog();
    }
  });

  // Shopify processes new media for a few seconds, so it can take a couple of tries to appear
  async function refreshPhotos() {
    if (!product) return;
    const before = product.media.length;
    for (let attempt = 0; attempt < 5; attempt++) {
      const data = await api<{ product: NonNullable<typeof product> }>(`/studio/api/product?id=${encodeURIComponent(product.id)}`).catch(() => null);
      if (data && product && data.product.media.length > before) {
        product = { ...product, media: data.product.media };
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // Compare: listing photos and generations, side by side with shared zoom
  let comparing = $state(false);
  let compareLeft = $state('');
  let compareRight = $state('');

  let compareItems = $derived<CompareItem[]>(
    product
      ? [
          ...generated.map((g) => ({
            key: `g:${g.id}`,
            url: `/studio/image/${g.id}`,
            thumb: `/studio/image/${g.id}`,
            label: `${g.presetName}${g.instruction ? ` → ${g.instruction}` : ''}`
          })),
          ...product.media.map((m, i) => ({
            key: `m:${m.id}`,
            url: sized(m.url, 2400),
            thumb: sized(m.url, 160),
            label: `Listing photo ${i + 1}`
          }))
        ]
      : []
  );

  function openCompare() {
    if (!product) return;
    if (showing.kind === 'generated') {
      const g = generated.find((x) => x.id === (showing as { id: string }).id);
      compareLeft = `g:${g?.id}`;
      // A generation is most useful next to the photo it was made from
      compareRight = g?.sourceMediaIds[0] ? `m:${g.sourceMediaIds[0]}` : `m:${product.media[0]?.id}`;
    } else {
      compareLeft = `m:${product.media[showing.index]?.id}`;
      compareRight = generated[0] ? `g:${generated[0].id}` : `m:${product.media[(showing.index + 1) % product.media.length]?.id}`;
    }
    comparing = true;
  }

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
        body: JSON.stringify({ productId: product.id, sourceMediaIds, presetName, prompt, count, model, imageSize, aspectRatio })
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

  let amendText = $state('');
  let amending = $state(false);
  let amendError = $state('');
  let amendBox = $state<HTMLTextAreaElement | null>(null);

  let showingGenerated = $derived(showing.kind === 'generated' ? generated.find((g) => g.id === (showing as { id: string }).id) ?? null : null);

  // Preset, then every change made on the way to this version
  let lineage = $derived.by(() => {
    const steps: string[] = [];
    let current = showingGenerated;
    while (current) {
      if (current.instruction) steps.unshift(current.instruction);
      current = current.parentId ? generated.find((g) => g.id === current!.parentId) ?? null : null;
    }
    return steps;
  });

  // Start fresh: a new image from the reference photos with every correction built into the prompt
  let freshOpen = $state(false);
  let freshBase = $state('');
  let freshChanges = $state<string[]>([]);
  let freshNote = $state('');
  let freshIncludeLatest = $state(false);
  let freshEditing = $state(false);
  let freshPrompt = $state('');
  let freshBusy = $state(false);
  let freshError = $state('');

  let composedFresh = $derived.by(() => {
    const corrections = [...freshChanges, ...(freshNote.trim() ? [freshNote.trim()] : [])];
    let text = freshBase;
    if (corrections.length) {
      text += `\n\nEarlier attempts at this photo needed these corrections. Get them right from the start:\n${corrections.map((c) => `- ${c}`).join('\n')}`;
    }
    if (freshIncludeLatest) {
      text += `\n\nThe last image provided is a previous attempt, included only to show what was being aimed for. Do not edit or copy it. Create a new photo from the reference photos of the antler, applying the corrections above.`;
    }
    return text;
  });

  async function openFresh() {
    if (!showingGenerated) return;
    freshError = '';
    freshEditing = false;
    freshNote = amendText.trim();
    try {
      const summary = await api<{ basePrompt: string; changes: string[] }>(`/studio/api/images/${showingGenerated.id}/fresh`);
      freshBase = summary.basePrompt;
      freshChanges = summary.changes;
      freshOpen = true;
    } catch (err) {
      amendError = (err as Error).message;
    }
  }

  function editFreshPrompt() {
    freshPrompt = composedFresh;
    freshEditing = true;
  }

  async function generateFresh() {
    if (!showingGenerated) return;
    freshBusy = true;
    freshError = '';
    try {
      const image = await api<Generated>(`/studio/api/images/${showingGenerated.id}/fresh`, {
        method: 'POST',
        body: JSON.stringify({
          prompt: freshEditing ? freshPrompt : composedFresh,
          includeLatest: freshIncludeLatest,
          model,
          imageSize
        })
      });
      generated = [image, ...generated];
      showing = { kind: 'generated', id: image.id };
      freshOpen = false;
      amendText = '';
    } catch (err) {
      freshError = (err as Error).message;
    } finally {
      freshBusy = false;
    }
  }

  function openForAmend(g: Generated) {
    freshOpen = false;
    showing = { kind: 'generated', id: g.id };
    view = 'single';
    amendError = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => amendBox?.focus(), 300);
  }

  async function amend() {
    if (!showingGenerated || !amendText.trim()) return;
    amending = true;
    amendError = '';
    try {
      const image = await api<Generated>(`/studio/api/images/${showingGenerated.id}/amend`, {
        method: 'POST',
        body: JSON.stringify({ instruction: amendText, model, imageSize })
      });
      generated = [image, ...generated];
      showing = { kind: 'generated', id: image.id };
      amendText = '';
    } catch (err) {
      amendError = (err as Error).message;
    } finally {
      amending = false;
    }
  }

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
      if (action === 'add') await refreshPhotos();
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

      <div class="flex flex-wrap items-center gap-2 text-xs">
        <label class="flex items-center gap-2">
          <span class="text-text-muted">Sort</span>
          <select class="input text-xs py-1.5" value={filters.sort} onchange={(e) => setFilter('sort', e.currentTarget.value)}>
            {#each SORTS as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
          </select>
        </label>
        <select class="input text-xs py-1.5 max-w-56" value={filters.collection} onchange={(e) => setFilter('collection', e.currentTarget.value)}>
          <option value="">All collections</option>
          {#each catalog.collections as c (c.id)}<option value={c.id}>{c.title} ({c.count})</option>{/each}
        </select>
        <select class="input text-xs py-1.5" value={filters.type} onchange={(e) => setFilter('type', e.currentTarget.value)}>
          <option value="">All types</option>
          {#each catalog.types as t (t)}<option value={t}>{t}</option>{/each}
        </select>
        <select class="input text-xs py-1.5" value={filters.status} onchange={(e) => setFilter('status', e.currentTarget.value)}>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
          <option value="all">Any status</option>
        </select>
        {#if filters.collection || filters.type || filters.status !== 'active' || query}
          <button
            class="text-text-muted hover:text-text-secondary transition-colors duration-150"
            onclick={() => { query = ''; filters = { ...filters, collection: '', type: '', status: 'active' }; searchProducts(); }}
          >Clear filters</button>
        {/if}
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
                <p class="text-xs text-text-muted mt-1">
                  {p.photos} photos · {cardTime(p)}{#if p.status !== 'ACTIVE'} · <span class="capitalize">{p.status.toLowerCase()}</span>{/if}
                </p>
              </div>
            </button>
          {:else}
            <p class="col-span-full text-sm text-text-muted py-8">
              {#if filters.sort === 'viewed'}No products opened in the studio yet{#if filters.collection || filters.type || query} that match these filters{/if}.
              {:else if filters.sort === 'edited'}No products with generated images yet{#if filters.collection || filters.type || query} that match these filters{/if}.
              {:else}No products match.{/if}
            </p>
          {/each}
        </div>
        {#if nextCursor}
          <div class="flex justify-center">
            <button class="btn-outline text-xs" disabled={loadingMore} onclick={loadMoreProducts}>{loadingMore ? 'Loading…' : 'Load more'}</button>
          </div>
        {/if}
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
          <button class="btn-outline text-xs shrink-0" disabled={!product.media.length} onclick={openCompare}>Compare</button>
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
            {#if showingGenerated}
              {@const g = showingGenerated}
              <div class="absolute top-3 right-3 flex gap-2">
                {#if g.creativeId}
                  <span class="text-xs px-3 py-1.5 rounded-md bg-black/60 text-white">In library ✓</span>
                {:else}
                  <button class="text-xs px-3 py-1.5 rounded-md bg-black/60 text-white hover:bg-black/75 disabled:opacity-60" disabled={!!working[g.id]} onclick={() => act(g, 'library')}>
                    {working[g.id] === 'library' ? 'Saving…' : 'Save to library'}
                  </button>
                {/if}
                {#if g.status === 'ADDED'}
                  <span class="text-xs px-3 py-1.5 rounded-md bg-positive/90 text-white">On listing ✓</span>
                {:else}
                  <button class="text-xs px-3 py-1.5 rounded-md accent-bg text-white hover:opacity-90 disabled:opacity-60" disabled={!!working[g.id]} onclick={() => act(g, 'add')}>
                    {working[g.id] === 'add' ? 'Adding…' : 'Add to this listing'}
                  </button>
                {/if}
              </div>
            {/if}
            {#if showing.kind === 'media'}
              <button class="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white text-lg" onclick={() => step(-1)} aria-label="Previous photo">‹</button>
              <button class="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white text-lg" onclick={() => step(1)} aria-label="Next photo">›</button>
            {/if}
          </div>
          {#if showingGenerated}
            <div class="card p-4 space-y-3">
              <p class="text-xs text-text-muted">
                <span class="text-text-secondary">{showingGenerated.presetName}</span>
                {#each lineage as change, i}
                  <span> → </span><span class="text-text-secondary" title={change}>{i + 1}. {change.length > 60 ? change.slice(0, 60) + '…' : change}</span>
                {/each}
              </p>
              <textarea
                bind:this={amendBox}
                bind:value={amendText}
                rows="2"
                class="input w-full text-sm resize-y"
                placeholder="Amend this image, e.g. warmer light, move the mug further back, less clutter on the table"
                onkeydown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) amend(); }}
              ></textarea>
              <div class="flex items-center justify-between gap-3">
                <p class="text-[11px] {amendError ? 'text-negative' : 'text-text-muted'}">
                  {amendError || 'Keeps the original prompt, earlier changes and reference photos. ⌘↵ to send.'}
                </p>
                <div class="flex gap-2 shrink-0">
                  <button class="btn-outline text-xs" disabled={amending || freshBusy} onclick={openFresh} title="New image from the original photos, with every correction built in">
                    Start fresh with these changes
                  </button>
                  <button class="btn-primary text-xs" disabled={amending || !amendText.trim()} onclick={amend}>
                    {amending ? 'Amending…' : 'Amend'}
                  </button>
                </div>
              </div>
              {#if lineage.length >= 2 && !freshOpen}
                <p class="text-[11px] text-text-muted">Amendments not landing? Starting fresh rebuilds the photo from your originals with all {lineage.length} changes in the prompt.</p>
              {/if}

              {#if freshOpen}
                <div class="border-t border-border pt-3 space-y-3">
                  <p class="text-xs text-text-secondary">
                    New image from the original reference photos{freshChanges.length ? `, with ${freshChanges.length} earlier ${freshChanges.length === 1 ? 'correction' : 'corrections'} built in` : ''}.
                  </p>
                  {#if freshChanges.length}
                    <ol class="text-xs text-text-muted list-decimal pl-5 space-y-0.5">
                      {#each freshChanges as c}<li>{c}</li>{/each}
                    </ol>
                  {/if}
                  {#if freshEditing}
                    <textarea class="input w-full text-xs font-mono leading-relaxed" rows="12" bind:value={freshPrompt}></textarea>
                  {:else}
                    <textarea class="input w-full text-sm resize-y" rows="2" bind:value={freshNote} placeholder="Anything else to get right this time? (optional)"></textarea>
                  {/if}
                  <label class="flex items-center gap-2 text-xs text-text-muted">
                    <input type="checkbox" bind:checked={freshIncludeLatest} />
                    Show the model this attempt as a loose reference (leave off if the idea was wrong)
                  </label>
                  <div class="flex items-center justify-between gap-3">
                    <div class="flex gap-3 text-xs">
                      {#if freshEditing}
                        <button class="text-text-muted hover:text-text-secondary" onclick={() => (freshEditing = false)}>Back to simple</button>
                      {:else}
                        <button class="text-text-muted hover:text-text-secondary" onclick={editFreshPrompt}>Edit full prompt</button>
                      {/if}
                      <button class="text-text-muted hover:text-text-secondary" onclick={() => (freshOpen = false)}>Cancel</button>
                    </div>
                    <button class="btn-primary text-xs" disabled={freshBusy} onclick={generateFresh}>
                      {freshBusy ? 'Generating…' : 'Generate fresh'}
                    </button>
                  </div>
                  {#if freshError}<p class="text-[11px] text-negative">{freshError}</p>{/if}
                </div>
              {/if}
            </div>
          {/if}

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
                  <button class="block w-full rounded-md overflow-hidden bg-elevated" onclick={() => openForAmend(g)}>
                    <img src="/studio/image/{g.id}" alt={g.presetName} class="w-full aspect-[4/5] object-cover" loading="lazy" />
                  </button>
                  <p class="text-xs text-text-secondary truncate">{g.presetName} <span class="text-text-muted">· {g.model === 'best' ? 'Best' : 'Fast'} {g.imageSize}</span></p>
                  {#if g.instruction}
                    <p class="text-[11px] text-text-muted truncate" title={g.instruction}>↳ {g.instruction}</p>
                  {/if}
                  <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {#if g.status === 'ADDED'}
                      <span class="text-positive">On listing</span>
                    {:else}
                      <button class="text-text-primary hover:underline disabled:opacity-50" disabled={!!working[g.id]} onclick={() => act(g, 'add')}>{working[g.id] === 'add' ? 'Adding…' : 'Add to this listing'}</button>
                    {/if}
                    {#if g.creativeId}
                      <span class="text-positive">In library</span>
                    {:else}
                      <button class="text-text-secondary hover:underline disabled:opacity-50" disabled={!!working[g.id]} onclick={() => act(g, 'library')}>{working[g.id] === 'library' ? 'Saving…' : 'Save to library'}</button>
                    {/if}
                    <button class="text-text-secondary hover:underline" onclick={() => openForAmend(g)}>Amend</button>
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
          <div class="space-y-1">
            <label for="studio-quality" class="text-[11px] text-text-muted">Quality</label>
            <select id="studio-quality" class="input text-xs w-full" value={quality} onchange={(e) => setQuality(e.currentTarget.value)}>
              {#each QUALITIES as q}
                <option value={q.value}>{q.label} ({q.hint})</option>
              {/each}
            </select>
          </div>
          <div class="grid grid-cols-3 gap-2 text-xs">
            {#each ['4:5', '1:1', '3:4'] as ratio}
              <button class="py-1.5 rounded-md border {aspectRatio === ratio ? 'border-[var(--accent)] text-text-primary' : 'border-border text-text-muted'}" onclick={() => (aspectRatio = ratio)}>{ratio}</button>
            {/each}
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

  {#if comparing && compareItems.length}
    <CompareView items={compareItems} bind:leftKey={compareLeft} bind:rightKey={compareRight} onclose={() => (comparing = false)} />
  {/if}
</div>
