'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ScrapeResponse } from '@/app/api/scrape/route';
import { CHANNELS } from '@/lib/config';
import type { TweetDetailsResult } from '@/lib/tweetDetails';

export default function HomePage() {
  const [channelId, setChannelId] = useState(CHANNELS[0].id);
  const [result, setResult] = useState<ScrapeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const runFetch = useCallback(async (id: string) => {
    setLoading(true);
    setRequestError(null);
    try {
      const res = await fetch(`/api/scrape?channel=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`API request failed with HTTP ${res.status}`);
      setResult((await res.json()) as ScrapeResponse);
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void runFetch(channelId);
  }, [channelId, runFetch]);

  return (
    <main>
      <div className="header">
        <h1>Source Feed</h1>
        <button className="fetch-button" onClick={() => runFetch(channelId)} disabled={loading}>
          {loading ? 'Fetching…' : 'Fetch Again'}
        </button>
      </div>

      {/* Channel tabs — every entry in src/lib/config.ts shows up here
          automatically, so adding a new source needs no UI changes. */}
      {CHANNELS.length > 1 && (
        <div className="channel-tabs">
          {CHANNELS.map((channel) => (
            <button
              key={channel.id}
              className={`channel-tab ${channel.id === channelId ? 'active' : ''}`}
              onClick={() => setChannelId(channel.id)}
            >
              {channel.label}
            </button>
          ))}
        </div>
      )}

      {requestError && (
        <div className="error-panel">
          <strong>Request failed:</strong> {requestError}
        </div>
      )}

      {result && (
        <>
          <p className="fetched-at">
            Last fetched at {new Date(result.fetchedAt).toLocaleString()}
          </p>

          <div className="account-chips">
            {result.accounts.map((account) => (
              <a
                key={account.handle}
                className={`account-chip ${account.ok ? 'ok' : 'failed'}`}
                href={`https://x.com/${account.handle}`}
                target="_blank"
                rel="noopener noreferrer"
                title={account.error ?? account.pageTitle ?? ''}
              >
                @{account.handle} · {account.ok ? `${account.linksFound} links` : 'failed'}
              </a>
            ))}
          </div>

          <h2 className="section-title">Latest posts ({result.tweets.length})</h2>
          {result.tweets.length > 0 ? (
            <ul className="post-list">
              {result.tweets.map((tweet) => (
                <li key={tweet.url}>
                  <TweetCard tweet={tweet} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-note">
              No status links were extracted from any account — X may have
              served a JavaScript-only shell.
            </p>
          )}
        </>
      )}

      {!result && !requestError && <p>Loading…</p>}
    </main>
  );
}

function TweetCard({ tweet }: { tweet: TweetDetailsResult }) {
  const { details } = tweet;

  return (
    <div className="tweet-card">
      {details ? (
        <>
          <div className="tweet-meta">
            {details.author.avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="tweet-avatar" src={details.author.avatarUrl} alt="" />
            )}
            <span className="tweet-author">{details.author.name}</span>
            <span className="tweet-handle">@{details.author.handle}</span>
            <span className="tweet-date">
              {details.createdAt ? new Date(details.createdAt).toLocaleString() : ''}
            </span>
          </div>
          <p className="tweet-text">{details.text}</p>
          {details.photos.length > 0 && (
            <div className="tweet-photos">
              {details.photos.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt="" />
              ))}
            </div>
          )}
          <div className="tweet-stats">
            {details.likes !== null && <span>♥ {details.likes.toLocaleString()}</span>}
            {details.replies !== null && <span>💬 {details.replies.toLocaleString()}</span>}
            <a href={tweet.url} target="_blank" rel="noopener noreferrer">
              Open on X ↗
            </a>
          </div>
          <details className="tweet-json">
            <summary>Raw JSON</summary>
            <pre>{JSON.stringify(details.raw, null, 2)}</pre>
          </details>
          <details className="tweet-card-preview">
            <summary>4:5 card (1080×1350)</summary>
            <a href={`/api/card/${details.id}`} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/card/${details.id}`} alt="Generated 4:5 card" loading="lazy" />
            </a>
            <div className="tweet-card-preview-hint">
              Click the preview to open the full-size PNG.
            </div>
          </details>
        </>
      ) : (
        <>
          <a href={tweet.url} target="_blank" rel="noopener noreferrer">
            {tweet.url}
          </a>
          <div className="tweet-detail-error">Details unavailable: {tweet.error}</div>
        </>
      )}
    </div>
  );
}
