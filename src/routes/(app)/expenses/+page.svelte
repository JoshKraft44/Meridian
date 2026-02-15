<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { formatCents, formatDateShort } from '$lib/utils';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const categories = [
    { label: 'Sourcing', value: 'SOURCING' },
    { label: 'Packaging', value: 'PACKAGING' },
    { label: 'Other', value: 'OTHER' }
  ];

  function categoryLabel(value: string) {
    return categories.find((c) => c.value === value)?.label ?? value;
  }

  function categoryColor(value: string) {
    switch (value) {
      case 'SOURCING': return 'bg-blue-500/10 text-blue-400';
      case 'PACKAGING': return 'bg-amber-500/10 text-amber-400';
      default: return 'bg-text-muted/10 text-text-muted';
    }
  }
</script>

<svelte:head>
  <title>Expenses — Meridian</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
  <div class="px-8 py-6 max-w-4xl mx-auto space-y-6">

    <h1 class="text-xl font-semibold text-text-primary">Expenses</h1>

    <form method="POST" action="?/create" use:enhance class="card p-5 space-y-4">
      <h2 class="text-sm font-semibold text-text-primary">Add expense</h2>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="space-y-1">
          <label for="date" class="text-xs text-text-secondary">Date</label>
          <input
            type="date"
            id="date"
            name="date"
            required
            class="input text-xs py-1.5 w-full"
          />
        </div>
        <div class="space-y-1">
          <label for="category" class="text-xs text-text-secondary">Category</label>
          <select id="category" name="category" required class="input text-xs py-1.5 w-full">
            {#each categories as cat}
              <option value={cat.value}>{cat.label}</option>
            {/each}
          </select>
        </div>
        <div class="space-y-1">
          <label for="amount" class="text-xs text-text-secondary">Amount (CAD)</label>
          <input
            type="number"
            id="amount"
            name="amount"
            step="0.01"
            min="0.01"
            required
            placeholder="0.00"
            class="input text-xs py-1.5 w-full"
          />
        </div>
        <div class="space-y-1">
          <label for="notes" class="text-xs text-text-secondary">Notes</label>
          <input
            type="text"
            id="notes"
            name="notes"
            placeholder="Optional"
            class="input text-xs py-1.5 w-full"
          />
        </div>
      </div>

      {#if form?.error}
        <p class="text-xs text-negative">{form.error}</p>
      {/if}

      <button type="submit" class="btn-outline text-xs">Add</button>
    </form>

    <div class="card overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-border text-xs text-text-muted uppercase tracking-wider">
            <th class="text-left px-4 py-3 font-medium">Date</th>
            <th class="text-left px-4 py-3 font-medium">Category</th>
            <th class="text-right px-4 py-3 font-medium">Amount</th>
            <th class="text-left px-4 py-3 font-medium">Notes</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {#each data.expenses as expense}
            <tr class="border-b border-border/50 hover:bg-elevated/50 transition-colors duration-150">
              <td class="px-4 py-3 text-text-secondary">
                {formatDateShort(expense.eventDate)}
              </td>
              <td class="px-4 py-3">
                <span class="text-xs px-2 py-0.5 rounded-full font-medium {categoryColor(expense.category)}">
                  {categoryLabel(expense.category)}
                </span>
              </td>
              <td class="px-4 py-3 text-right text-text-primary tabular-nums">
                {formatCents(expense.amountCents)}
              </td>
              <td class="px-4 py-3 text-text-muted text-xs">
                {expense.notes ?? ''}
              </td>
              <td class="px-4 py-3 text-right">
                <form method="POST" action="?/delete" use:enhance class="inline">
                  <input type="hidden" name="id" value={expense.id} />
                  <button type="submit" class="text-xs text-text-muted hover:text-negative transition-colors">
                    Delete
                  </button>
                </form>
              </td>
            </tr>
          {/each}

          {#if data.expenses.length === 0}
            <tr>
              <td colspan="5" class="px-4 py-12 text-center text-text-muted text-sm">
                No expenses yet
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>

  </div>
</div>
