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

  // Each side has its own zoom and scroll position. The locks decide whether a zoom or pan
  // on one side carries over to the other.
  let zooms = $state([1, 1]);
  let lockZoom = $state(true);
  let lockPan = $state(false);
  let active = $state(0);
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

  // Where each pane was last seen, to turn scroll events into a pan distance
  const lastScroll = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  function remember(side: number) {
    const pane = panes[side];
    if (pane) lastScroll[side] = { x: pane.scrollLeft, y: pane.scrollTop };
  }

  function onScroll(side: number) {
    const pane = panes[side];
    if (!pane) return;
    const dx = pane.scrollLeft - lastScroll[side].x;
    const dy = pane.scrollTop - lastScroll[side].y;
    remember(side);
    if (!lockPan || (dx === 0 && dy === 0)) return;

    const other = panes[1 - side];
    if (!other) return;
    other.scrollLeft += dx;
    other.scrollTop += dy;
    // remembered straight away so the other side's own scroll event doesn't bounce back
    remember(1 - side);
  }

  // Zooms by a factor rather than to a level, so locked sides keep whatever difference they had
  async function zoomBy(factor: number, focus?: { pane: number; clientX: number; clientY: number }) {
    const sides = lockZoom ? [0, 1] : [focus?.pane ?? active];
    const current = sides.map((s) => zooms[s]);
    const limited = Math.max(MIN_ZOOM / Math.min(...current), Math.min(MAX_ZOOM / Math.max(...current), factor));
    if (limited === 1) return;

    const anchors = sides.map((s) => {
      const pane = panes[s];
      const focused = focus?.pane === s;
      return pane ? anchorFor(pane, focused ? focus.clientX : undefined, focused ? focus.clientY : undefined) : null;
    });
    for (const s of sides) zooms[s] *= limited;
    await tick();

    sides.forEach((s, i) => {
      const pane = panes[s];
      const a = anchors[i];
      if (!pane || !a) return;
      pane.scrollLeft = a.fx * pane.scrollWidth - a.x;
      pane.scrollTop = a.fy * pane.scrollHeight - a.y;
    });
    // a zoom moves the scroll position too, which shouldn't count as a pan
    remember(0);
    remember(1);
  }

  async function fit() {
    zooms = [1, 1];
    await tick();
    remember(0);
    remember(1);
  }

  function onWheel(e: WheelEvent, pane: number) {
    // Plain scroll pans; pinch (Chrome) and ⌘/ctrl + scroll zoom
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoomBy(Math.exp(-e.deltaY * 0.01), { pane, clientX: e.clientX, clientY: e.clientY });
  }

  // Safari reports trackpad pinch as gesture events instead of ctrl + wheel
  let lastScale = 1;
  function onGestureStart(e: Event) {
    e.preventDefault();
    lastScale = 1;
  }
  function onGestureChange(e: Event, pane: number) {
    e.preventDefault();
    const g = e as Event & { scale: number; clientX: number; clientY: number };
    zoomBy(g.scale / lastScale, { pane, clientX: g.clientX, clientY: g.clientY });
    lastScale = g.scale;
  }

  // Drag to pan when zoomed in
  let drag: { pane: HTMLDivElement; x: number; y: number } | null = null;
  function onPointerDown(e: PointerEvent, side: number) {
    const pane = panes[side];
    if (!pane || zooms[side] === 1 || e.button !== 0) return;
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

  // Zooms back out as far as the lock allows, or in if there's nowhere to go
  function onDoubleClick(e: MouseEvent, pane: number) {
    const lowest = lockZoom ? Math.min(...zooms) : zooms[pane];
    zoomBy(lowest > 1 ? 1 / lowest : 2.5, { pane, clientX: e.clientX, clientY: e.clientY });
  }

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onclose();
      if (e.key === '+' || e.key === '=') zoomBy(1.25);
      if (e.key === '-') zoomBy(1 / 1.25);
      if (e.key === '0') fit();
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
      <button class="btn-outline px-2.5" onclick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">−</button>
      <span class="min-w-12 text-center text-text-secondary tabular-nums">
        {#if zooms[0] === zooms[1]}
          {Math.round(zooms[0] * 100)}%
        {:else}
          {Math.round(zooms[0] * 100)}% · {Math.round(zooms[1] * 100)}%
        {/if}
      </span>
      <button class="btn-outline px-2.5" onclick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
      <button class="btn-outline" onclick={fit}>Fit</button>
      <button
        class="btn-outline ml-2 {lockZoom ? 'border-[var(--accent)] text-text-primary' : ''}"
        aria-pressed={lockZoom}
        title="Zoom both sides together, keeping any difference between them"
        onclick={() => (lockZoom = !lockZoom)}
      >
        Lock zoom
      </button>
      <button
        class="btn-outline {lockPan ? 'border-[var(--accent)] text-text-primary' : ''}"
        aria-pressed={lockPan}
        title="Pan both sides together"
        onclick={() => (lockPan = !lockPan)}
      >
        Lock pan
      </button>
      <span class="text-text-muted ml-2 hidden xl:inline">Pinch or ⌘ + scroll to zoom · scroll or drag to pan · Esc to close</span>
    </div>
    <button class="btn-outline text-xs" onclick={onclose}>Close</button>
  </header>

  <div class="flex-1 min-h-0 grid grid-cols-2 gap-px bg-border">
    {#each [{ item: left, side: 0 }, { item: right, side: 1 }] as { item, side } (side)}
      <div class="bg-base flex flex-col min-h-0">
        <div class="px-4 py-2 text-xs text-text-secondary truncate">{item?.label}</div>

        <div
          bind:this={panes[side]}
          class="flex-1 min-h-0 overflow-auto bg-elevated {zooms[side] > 1 ? 'cursor-grab active:cursor-grabbing' : ''}"
          role="img"
          aria-label={item?.label}
          onwheel={(e) => onWheel(e, side)}
          onscroll={() => onScroll(side)}
          onpointerenter={() => (active = side)}
          onpointerdown={(e) => onPointerDown(e, side)}
          onpointermove={onPointerMove}
          onpointerup={onPointerUp}
          onpointercancel={onPointerUp}
          ondblclick={(e) => onDoubleClick(e, side)}
        >
          <div style="width: {zooms[side] * 100}%; height: {zooms[side] * 100}%;">
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
