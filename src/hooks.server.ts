import type { Handle } from '@sveltejs/kit';
import { verifySessionToken } from '$lib/server/auth';
import { startScheduler } from '$lib/server/scheduler';

startScheduler();

export const handle: Handle = async ({ event, resolve }) => {
  const sessionCookie = event.cookies.get('session');

  if (sessionCookie) {
    const user = verifySessionToken(sessionCookie);
    if (user) {
      event.locals.user = user;
    }
  }

  return resolve(event);
};
