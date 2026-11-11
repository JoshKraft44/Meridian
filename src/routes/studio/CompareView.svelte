<script lang="ts">
  import { onMount, tick } from 'svelte';

  export type CompareItem = { key: string; url: string; thumb: string; label: string };

  let {
    items,
    leftKey = $bindable(),
    rightKey = $bindable(),
    onclose
  }: { items: CompareItem[]; leftKey: string; rightKey: string; onclose: () => void } = $props();

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 8;

  // One zoom level for both sides; each side keeps its own scroll position
  let zoom = $state(1);
  let panes = $state<(HTMLDivElement | null)[]>([null, null]);

  let left = $derived(items.find((i) => i.key === leftKey) ?? items[0]);
  let right = $derived(items.find((i) => i.key === rightKey) ?? items[0]);

  // The point (as a fraction of the image) each pane should keep in place while zooming
  function anchorFor(pane: HTMLDivElement, clientX?: number, clientY?: number) {
    const rect = pane.getBoundingClientRect();
    const x = clientX !== undefined ? clientX - rect.left : pane.clientWidth / 2;
    const y = clientY !== undefined ? clientY - rect.top : pane.clientHeight / 2;
    return {
      fx: (pane.scrollLeft + x) / pane.scrollWidth,
      fy: (pane.scrollTop + y) / pane.scrollHeight,
      x,
      y
    };
  }

  async function setZoom(next: number, focus?: { pane: number; clientX: number; clientY: number }) {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    if (clamped === zoom) return;

    const anchors = panes.map((pane, i) =>
      pane ? anchorFor(pane, focus?.pane === i ? focus.clientX : undefined, focus?.pane === i ? focus.clientY : undefined) : null
    );
    zoom = clamped;
    await tick();

    panes.forEach((pane, i) => {
      const a = anchors[i];
      if (!pane || !a) return;
      pane.scrollLeft = a.fx * pane.scrollWidth - a.x;
      pane.scrollTop = a.fy * pane.scrollHeight - a.y;
    });
  }

  function onWheel(e: WheelEvent, pane: number) {
    // Plain scroll pans this side only; pinch (Chrome) and ⌘/ctrl + scroll zoom both
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom(zoom * Math.exp(-e.deltaY * 0.01), { pane, clientX: e.clientX, clientY: e.clientY });
  }

  // Safari reports trackpad pinch as gesture events instead of ctrl + wheel
  let gestureStartZoom = 1;
  function onGestureStart(e: Event) {
    e.preventDefault();
    gestureStartZoom = zoom;
  }
  function onGestureChange(e: Event, pane: number) {
    e.preventDefault();
    const g = e as Event & { scale: number; clientX: number; clientY: number };
    setZoom(gestureStartZoom * g.scale, { pane, clientX: g.clientX, clientY: g.clientY });
  }

  // Drag to pan when zoomed in
  let drag: { pane: HTMLDivElement; x: number; y: number } | null = null;
  function onPointerDown(e: PointerEvent, pane: HTMLDivElement) {
    if (zoom === 1 || e.button !== 0) return;
    drag = { pane, x: e.clientX, y: e.clientY };
    pane.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    drag.pane.scrollLeft -= e.clientX - drag.x;
    drag.pane.scrollTop -= e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
  }
  function onPointerUp() {
    drag = null;
  }

  function onDoubleClick(e: MouseEvent, pane: number) {
    setZoom(zoom > 1 ? 1 : 2.5, { pane, clientX: e.clientX, clientY: e.clientY });
  }

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onclose();
      if (e.key === '+' || e.key === '=') setZoom(zoom * 1.25);
      if (e.key === '-') setZoom(zoom / 1.25);
      if (e.key === '0') setZoom(1);
    };
    window.addEventListener('keydown', onKey);

    // Gesture events aren't in Svelte's typed handlers, so they're wired up here
    const cleanups = panes.map((pane, i) => {
      if (!pane) return () => {};
      const change = (e: Event) => onGestureChange(e, i);
      pane.addEventListener('gesturestart', onGestureStart);
      pane.addEventListener('gesturechange', change);
      return () => {
        pane.removeEventListener('gesturestart', onGestureStart);
        pane.removeEventListener('gesturechange', change);
      };
    });

    return () => {
      window.removeEventListener('keydown', onKey);
      cleanups.forEach((c) => c());
    };
  });
</script>

<div class="fixed inset-0 z-50 bg-base flex flex-col">
  <header class="flex items-center justify-between gap-4 px-5 py-3 border-b border-border">
    <p class="text-sm font-semibold">Compare</p>
    <div class="flex items-center gap-2 text-xs">
      <button class="btn-outline px-2.5" onclick={() => setZoom(zoom / 1.25)} aria-label="Zoom out">−</button>
      <span class="w-12 text-center text-text-secondary tabular-nums">{Math.round(zoom * 100)}%</span>
      <button class="btn-outline px-2.5" onclick={() => setZoom(zoom * 1.25)} aria-label="Zoom in">+</button>
      <button class="btn-outline" onclick={() => setZoom(1)}>Fit</button>
      <span class="text-text-muted ml-2 hidden lg:inline">Pinch or ⌘ + scroll to zoom both · scroll or drag to pan each · Esc to close</span>
    </div>
    <button class="btn-outline text-xs" onclick={onclose}>Close</button>
  </header>

  <div class="flex-1 min-h-0 grid grid-cols-2 gap-px bg-border">
    {#each [{ item: left, side: 0 }, { item: right, side: 1 }] as { item, side } (side)}
      <div class="bg-base flex flex-col min-h-0">
        <div class="px-4 py-2 text-xs text-text-secondary truncate">{item?.label}</div>

        <div
          bind:this={panes[side]}
          class="flex-1 min-h-0 overflow-auto bg-elevated {zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''}"
          role="img"
          aria-label={item?.label}
          onwheel={(e) => onWheel(e, side)}
          onpointerdown={(e) => onPointerDown(e, panes[side]!)}
          onpointermove={onPointerMove}
          onpointerup={onPointerUp}
          onpointercancel={onPointerUp}
          ondblclick={(e) => onDoubleClick(e, side)}
        >
          <div style="width: {zoom * 100}%; height: {zoom * 100}%;">
            {#if item}
              <img src={item.url} alt={item.label} draggable="false" class="w-full h-full object-contain select-none" />
            {/if}
          </div>
        </div>

        <div class="flex gap-2 overflow-x-auto px-3 py-2 border-t border-border">
          {#each items as option (option.key)}
            {@const selected = (side === 0 ? leftKey : rightKey) === option.key}
            <button
              class="shrink-0 w-14 h-14 rounded overflow-hidden border-2 transition-all duration-150 {selected ? 'border-[var(--accent)]' : 'border-transparent opacity-70 hover:opacity-100'}"
              title={option.label}
              onclick={() => (side === 0 ? (leftKey = option.key) : (rightKey = option.key))}
            >
              <img src={option.thumb} alt="" class="w-full h-full object-cover" loading="lazy" />
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
