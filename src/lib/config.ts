/**
 * Channel registry — the single place that defines what gets scraped and
 * where it gets posted. Add a new channel to extend the app to a new tweet
 * source + Instagram destination:
 *
 *   1. Add an entry below with a unique `id`, a `label`, and the X handles
 *      to source tweets from.
 *   2. Set its Instagram credentials as env vars named after the id:
 *      IG_USER_ID_<ID> and IG_ACCESS_TOKEN_<ID> (e.g. IG_USER_ID_MYCHANNEL).
 *      The first (default) channel keeps using the unprefixed IG_USER_ID /
 *      IG_ACCESS_TOKEN, so existing deployments don't need to rename them.
 *   3. Optionally add a second cron step in .github/workflows/publish.yml
 *      that calls `/api/publish?channel=<id>`.
 *
 * No other code changes are required — the scrape feed, the publish
 * pipeline, and the web UI all read from this list.
 */

export interface Channel {
  /** URL-safe identifier — used in ?channel= query params and env var names. */
  id: string;
  /** Display name shown in the UI. */
  label: string;
  /** X handles this channel sources tweets from (merged into one feed). */
  handles: string[];
}

export const CHANNELS: Channel[] = [
  { id: 'polymarket', label: 'Polymarket', handles: ['Polymarket'] },
];

export const DEFAULT_CHANNEL = CHANNELS[0];

export function getChannel(id: string | null | undefined): Channel {
  return CHANNELS.find((c) => c.id === id) ?? DEFAULT_CHANNEL;
}
