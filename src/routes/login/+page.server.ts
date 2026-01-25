import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { validateCredentials, createSession, cookieOptions } from '$lib/server/auth';

export const load: PageServerLoad = ({ locals }) => {
  if (locals.user) {
    redirect(302, '/');
  }
};

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData();
    const username = data.get('username')?.toString();
    const password = data.get('password')?.toString();

    if (!username || !password) {
      return fail(400, { message: 'Missing fields' });
    }

    const valid = await validateCredentials(username, password);
    if (!valid) {
      return fail(401, { message: 'Invalid credentials' });
    }

    const token = createSession(username);
    cookies.set('session', token, cookieOptions);

    redirect(302, '/');
  }
};
