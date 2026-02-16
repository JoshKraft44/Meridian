<script lang="ts">
  import { onMount } from 'svelte';
  import type { CostBreakdown } from '$lib/server/profit';
  import { formatCents } from '$lib/utils';

  let { data }: { data: CostBreakdown[] } = $props();

  let canvas = $state<HTMLCanvasElement>();
  let ChartCtor = $state<any>(null);
  let chart: any = null;

  onMount(() => {
    import('chart.js').then(({ Chart, BarController, BarElement, LinearScale, CategoryScale, Tooltip }) => {
      Chart.register(BarController, BarElement, LinearScale, CategoryScale, Tooltip);
      ChartCtor = Chart;
    });
    return () => { chart?.destroy(); chart = null; };
  });

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#18181b',
        borderColor: '#27272a',
        borderWidth: 1,
        padding: 10,
        titleColor: '#a1a1aa',
        bodyColor: '#fafafa',
        callbacks: {
          label: (ctx: any) => ` ${formatCents(Math.round((ctx.raw as number) * 100))}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#52525b', font: { size: 11 } },
        border: { display: false }
      },
      y: {
        grid: { color: '#27272a' },
        ticks: {
          color: '#52525b',
          font: { size: 11 },
          callback: (v: any) => `$${Number(v).toFixed(0)}`
        },
        border: { display: false }
      }
    }
  };

  $effect(() => {
    if (!ChartCtor || !canvas || data.length === 0) return;

    const accent =
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c0392b';
    const labels = data.map((d) => d.label);
    const values = data.map((d) => d.totalCents / 100);

    if (chart) {
      chart.data.labels = labels;
      chart.data.datasets[0].data = values;
      chart.update();
    } else {
      chart = new ChartCtor(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: `${accent}99`,
              borderColor: accent,
              borderWidth: 1,
              borderRadius: 4
            }
          ]
        },
        options: chartOptions
      });
    }
  });
</script>

<div class="card p-5">
  <p class="text-xs font-medium text-text-muted uppercase tracking-widest mb-4">Cost breakdown</p>

  {#if data.length === 0}
    <div class="h-44 flex items-center justify-center text-sm text-text-muted">No cost data for this period</div>
  {:else}
    <div class="h-44">
      <canvas bind:this={canvas}></canvas>
    </div>
  {/if}
</div>
