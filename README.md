# forecastfeed

Turns the latest posts from an X (Twitter) account into news-style picture
cards and posts them to Instagram automatically — no manual work needed.

## What it does

1. Checks an X account for its newest posts.
2. Turns each one into a designed image card.
3. Posts the card to Instagram, with a caption and hashtags — automatically,
   every hour, skipping anything already posted.

## Running it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000 to see the latest posts and preview the
generated cards.

## Adding a new source

Open `src/lib/config.ts` and add the X account (and its own Instagram
account) you want it to post to — no other changes needed.

## Setup

See the comments in `.env.example` for the Instagram credentials required
for auto-posting.

## Scheduling

`.github/workflows/publish.yml` runs on an hourly GitHub Actions schedule,
calling `POST /api/publish` on the deployed app with an
`Authorization: Bearer <CRON_SECRET>` header. Use its "Run workflow" button
on the Actions tab to publish on demand or to debug.
