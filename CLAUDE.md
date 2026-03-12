# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Flux is a French-language RSS feed aggregator built with **Astro 5** and deployed on **Netlify**. It aggregates tech RSS feeds and YouTube channels into a static site with client-side search and filtering.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server on localhost:4321 |
| `npm run build` | Production build → `./dist/` |
| `npm run preview` | Preview production build |
| `npm run fetch-feeds` | Fetch RSS articles → `/data/*.json` |

## Architecture

**Data pipeline:** `feeds.yaml` → `scripts/fetch-feeds.ts` (rss-parser for RSS/Atom, YouTube Data API v3 for YouTube channels, parallel batch processing) → monthly JSON files in `/data/` → Astro static build → Netlify deploy.

**Key flow:** GitHub Actions runs `fetch-feeds` daily at 4 UTC, commits new articles, then Netlify rebuilds.

**Frontend:** Static HTML with client-side JS for Fuse.js search, category/source/type filtering, and pagination (15 articles/page). Uses Tailwind CSS v4 and Astro View Transitions. Three content types: blog articles, podcasts (with audio player), and YouTube videos (with embedded player).

**YouTube integration:** YouTube channels use the YouTube Data API v3 (playlistItems endpoint, 1 unit/request). The `YOUTUBE_API_KEY` env var is required (`.env` locally, GitHub Actions secret in CI). In `feeds.yaml`, YouTube feeds use `type: youtube` and the `url` field contains the channel ID (e.g. `UCxxx`).

## Key Files

- `feeds.yaml` — RSS/YouTube source definitions with categories and types
- `scripts/fetch-feeds.ts` — Aggregation script (dedup via SHA256 URL hash, image extraction, date filtering)
- `src/utils/articles.ts` — Article loading, search, categorization utilities
- `src/types/index.ts` — TypeScript interfaces (Article, FeedsConfig)
- `src/pages/index.astro` — Main page with article list
- `src/pages/page/[page].astro` — Static pagination pages
- `src/pages/article/[id].astro` — Dynamic article detail (noindex)
- `src/pages/sources.astro` — List of all aggregated RSS sources
- `src/pages/a-propos.astro` — About page
- `src/pages/search-index.json.ts` — JSON search index for Fuse.js (on-demand)
- `src/pages/rss.xml.ts` — Outbound RSS feed (50 latest articles)

## Conventions

- All UI text is in French
- Path alias: `@/*` maps to `src/*`
- TypeScript strict mode enabled
- Articles are deduplicated by SHA256 hash of URL (first 12 chars)
- Data files are organized monthly: `/data/YYYY-MM.json`
- Article pages have `noindex` meta and are excluded from sitemap
