<script lang="ts">
  type LightboxImage = { src: string; alt: string | null };

  let {
    images = [],
    startIndex = 0,
    onclose
  }: {
    images: LightboxImage[];
    startIndex?: number;
    onclose: () => void;
  } = $props();

  let current = $state(startIndex);

  function prev() {
    current = (current - 1 + images.length) % images.length;
  }

  function next() {
    current = (current + 1) % images.length;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'ArrowRight') next();
  }
</script>

<svelte:window on:keydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
  onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
>
  <div class="relative max-w-3xl max-h-[85vh] w-full mx-4">
    <!-- Close button -->
    <button
      onclick={onclose}
      class="absolute -top-10 right-0 text-white/60 hover:text-white transition-colors text-sm"
    >
      Close
    </button>

    <!-- Image -->
    <div class="flex items-center justify-center">
      <img
        src={images[current].src}
        alt={images[current].alt ?? ''}
        class="max-h-[80vh] max-w-full rounded-lg object-contain"
      />
    </div>

    <!-- Nav arrows -->
    {#if images.length > 1}
      <button
        onclick={prev}
        class="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/70 flex items-center justify-center transition-all duration-150"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        onclick={next}
        class="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/70 flex items-center justify-center transition-all duration-150"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <!-- Dots -->
      <div class="flex items-center justify-center gap-1.5 mt-4">
        {#each images as _, i}
          <button
            onclick={() => current = i}
            class="w-2 h-2 rounded-full transition-all duration-150 {i === current ? 'bg-white' : 'bg-white/30 hover:bg-white/50'}"
          ></button>
        {/each}
      </div>
    {/if}
  </div>
</div>
