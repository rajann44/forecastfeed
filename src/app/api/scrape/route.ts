import { NextResponse } from 'next/server';
import { getChannel } from '@/lib/config';
import { scrapeProfile } from '@/lib/scraper';
import { fetchAllTweetDetails, shouldSkipTweet, type TweetDetailsResult } from '@/lib/tweetDetails';

// Every request must hit X live — never serve a cached result.
export const dynamic = 'force-dynamic';

// Main app shows only the latest handful of posts per channel.
const MAX_FEED_TWEETS = 5;

export interface AccountSummary {
  handle: string;
  ok: boolean;
  httpStatus: number | null;
  pageTitle: string | null;
  linksFound: number;
  error: string | null;
}

export interface ScrapeResponse {
  channel: string;
  fetchedAt: string;
  accounts: AccountSummary[];
  /** This channel's tweets merged, deduped, newest first, capped to MAX_FEED_TWEETS. */
  tweets: TweetDetailsResult[];
}

export async function GET(request: Request) {
  const channel = getChannel(new URL(request.url).searchParams.get('channel'));

  // All handles in the channel in parallel; one failing account never
  // blocks the others.
  const results = await Promise.all(
    channel.handles.map(async (handle) => {
      const result = await scrapeProfile(handle, 10);
      const tweets = await fetchAllTweetDetails(result.urls);
      return { handle, result, tweets };
    }),
  );

  const accounts: AccountSummary[] = results.map(({ handle, result }) => ({
    handle,
    ok: result.ok,
    httpStatus: result.httpStatus,
    pageTitle: result.pageTitle,
    linksFound: result.linksFound,
    error: result.error,
  }));

  // Merge into one feed: dedupe by status ID, newest (largest snowflake)
  // first. Tweets that share an external link, or that name-drop
  // "polymarket" in their own text, are excluded — this app posts
  // self-contained, brand-neutral cards, not link-outs or self-promotion.
  const byId = new Map<string, TweetDetailsResult>();
  for (const { tweets } of results) {
    for (const tweet of tweets) {
      if (tweet.details && shouldSkipTweet(tweet.details)) continue;
      if (tweet.id && !byId.has(tweet.id)) byId.set(tweet.id, tweet);
    }
  }
  const tweets = [...byId.values()]
    .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? 1 : BigInt(a.id) > BigInt(b.id) ? -1 : 0))
    .slice(0, MAX_FEED_TWEETS);

  return NextResponse.json({
    channel: channel.id,
    fetchedAt: new Date().toISOString(),
    accounts,
    tweets,
  } satisfies ScrapeResponse);
}
