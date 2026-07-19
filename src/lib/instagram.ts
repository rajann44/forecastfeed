/**
 * Instagram Content Publishing via the official "Instagram API with
 * Instagram Login" (graph.instagram.com) — no Facebook Page required, the
 * account authenticates directly.
 *
 * Credentials are looked up per channel (see src/lib/config.ts): the
 * default (first) channel uses the unprefixed IG_USER_ID / IG_ACCESS_TOKEN
 * env vars; every other channel uses IG_USER_ID_<ID> / IG_ACCESS_TOKEN_<ID>,
 * so adding a new channel + Instagram account is just two new env vars.
 *
 * Publishing is a two-step flow: create a media container from a public
 * image URL, wait for it to be ready, then publish it.
 */

import { DEFAULT_CHANNEL } from './config';

const GRAPH_BASE = 'https://graph.instagram.com/v21.0';
const CONTAINER_POLL_MS = 2_000;
const CONTAINER_POLL_ATTEMPTS = 15;

function envVarNames(channelId: string): { userIdVar: string; tokenVar: string } {
  if (channelId === DEFAULT_CHANNEL.id) {
    return { userIdVar: 'IG_USER_ID', tokenVar: 'IG_ACCESS_TOKEN' };
  }
  const suffix = channelId.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return { userIdVar: `IG_USER_ID_${suffix}`, tokenVar: `IG_ACCESS_TOKEN_${suffix}` };
}

export function instagramConfigured(channelId: string): boolean {
  const { userIdVar, tokenVar } = envVarNames(channelId);
  return Boolean(process.env[userIdVar] && process.env[tokenVar]);
}

function credentials(channelId: string) {
  const { userIdVar, tokenVar } = envVarNames(channelId);
  const userId = process.env[userIdVar];
  const token = process.env[tokenVar];
  if (!userId || !token) throw new Error(`${userIdVar} / ${tokenVar} not configured`);
  return { userId, token };
}

/**
 * Captions of the most recent posts on this channel's account. Used for
 * dedupe: each caption we publish carries an invisible marker encoding the
 * tweet ID (see src/lib/hiddenId.ts), so no database is needed.
 */
export async function fetchRecentCaptions(channelId: string, limit = 25): Promise<string[]> {
  const { userId, token } = credentials(channelId);
  const url =
    `${GRAPH_BASE}/${userId}/media?fields=caption&limit=${limit}` +
    `&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to list media: HTTP ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { data?: Array<{ caption?: string }> };
  return (data.data ?? []).map((m) => m.caption ?? '');
}

/** Publish an image (must be a public URL) with a caption. Returns media ID. */
export async function publishImage(
  channelId: string,
  imageUrl: string,
  caption: string,
): Promise<string> {
  const { userId, token } = credentials(channelId);

  // Step 1: create the media container.
  const createRes = await fetch(`${GRAPH_BASE}/${userId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, caption, access_token: token }),
  });
  if (!createRes.ok) {
    throw new Error(`Container creation failed: HTTP ${createRes.status} ${await createRes.text()}`);
  }
  const { id: containerId } = (await createRes.json()) as { id: string };

  // Step 2: wait until Instagram has fetched and processed the image.
  for (let i = 0; i < CONTAINER_POLL_ATTEMPTS; i++) {
    const statusRes = await fetch(
      `${GRAPH_BASE}/${containerId}?fields=status_code&access_token=${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    );
    const { status_code: status } = (await statusRes.json()) as { status_code?: string };
    if (status === 'FINISHED') break;
    if (status === 'ERROR') throw new Error('Instagram failed to process the image container');
    await new Promise((r) => setTimeout(r, CONTAINER_POLL_MS));
  }

  // Step 3: publish.
  const publishRes = await fetch(`${GRAPH_BASE}/${userId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: containerId, access_token: token }),
  });
  if (!publishRes.ok) {
    throw new Error(`Publish failed: HTTP ${publishRes.status} ${await publishRes.text()}`);
  }
  const { id: mediaId } = (await publishRes.json()) as { id: string };
  return mediaId;
}
