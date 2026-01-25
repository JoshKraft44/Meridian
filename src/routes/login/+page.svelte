<script lang="ts">
  import { enhance } from '$app/forms';

  let error = '';
  let loading = false;
</script>

<div class="min-h-screen flex items-center justify-center bg-base">
  <div class="w-full max-w-md">
    <div class="flex flex-col gap-8">
      <h1 class="text-3xl font-semibold">Meridian</h1>

      <form
        method="POST"
        use:enhance={() => {
          loading = true;
          return async ({ result }) => {
            if (result.type === 'failure') {
              error = 'Invalid username or password';
            }
            loading = false;
          };
        }}
        class="space-y-4"
      >
        <div>
          <label for="username" class="block text-sm font-medium mb-2">Username</label>
          <input
            type="text"
            name="username"
            id="username"
            required
            disabled={loading}
            class="input w-full"
            placeholder="admin"
          />
        </div>

        <div>
          <label for="password" class="block text-sm font-medium mb-2">Password</label>
          <input
            type="password"
            name="password"
            id="password"
            required
            disabled={loading}
            class="input w-full"
          />
        </div>

        {#if error}
          <div class="text-sm text-red-400 bg-red-950/20 rounded border border-red-900/20 p-2">
            {error}
          </div>
        {/if}

        <button type="submit" disabled={loading} class="btn-primary w-full">
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  </div>
</div>
