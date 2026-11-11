import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/db';

// Saving an edited prompt always makes a new preset, stamped with the date, so the originals stay intact
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) error(401, 'Unauthorized');

  const { name, description, prompt } = await request.json();
  if (!name?.trim() || !prompt?.trim()) error(400, 'Name and prompt are required');

  const stamp = new Date().toLocaleString('en-CA', {
    timeZone: 'America/Regina',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  const preset = await db.scenePreset.create({
    data: { name: `${name.trim()} · ${stamp}`, description: String(description ?? '').trim(), prompt: prompt.trim() },
    select: { id: true, name: true, description: true, prompt: true, builtIn: true, createdAt: true }
  });
  return json(preset);
};
