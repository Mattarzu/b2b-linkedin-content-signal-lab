# B2B LinkedIn Content Signal Lab

A reproducible research project on organic LinkedIn strategy for B2B SaaS.

## Research question

> What evidence-backed organic LinkedIn content patterns help a B2B SaaS company earn attention and trust from future buyers before they enter an active buying cycle?

## Why this topic

Organic LinkedIn is a relevant channel for B2B SaaS because it can build familiarity, credibility, and category awareness before a buyer is actively evaluating software.

This project is not a generic “post more often” content guide. It collects high-signal material from experienced B2B SaaS operators and content practitioners, preserving source URLs, publication dates, collection dates, transcripts, and researcher notes.

## Scope

The final corpus will include:

* 10 carefully selected B2B SaaS and content operators.
* Recent LinkedIn posts manually collected from each expert.
* YouTube interviews, talks, or podcasts collected through an API.
* Metadata and validation rules that make the research traceable and reproducible.
* A cross-source synthesis that separates evidence, recurring patterns, and future hypotheses.

## Repository structure

```text
research/
  sources.md                # Expert selection and source index
  expert-manifest.json      # Structured expert metadata
  linkedin-posts/           # Posts grouped by author
  youtube-transcripts/      # API-collected transcripts grouped by video
  other/                    # Methodology, collection log, and synthesis
scripts/
  collect-transcripts.ts    # Transcript API collection pipeline
  validate-research.ts      # Corpus integrity checks
docs/
  data-schema.md            # File and metadata conventions
```

## Collection methods

* **LinkedIn:** manual collection only. Every item records a canonical URL, visible publication date, capture date, format, themes, and researcher note.
* **YouTube:** transcript collection through an API. Every transcript records video metadata, timestamps, collection date, language, and source URL.

## Research principles

1. Prefer practitioners with direct B2B SaaS operating experience.
2. Prioritize primary-source material over generic summaries.
3. Preserve provenance for every research artifact.
4. Record uncertainty instead of inventing missing metadata.
5. Separate observed evidence from future strategy hypotheses.

## Local commands

```bash
npm install
npm run typecheck
npm run validate
npm run check
```

## Status

Project initialized. Expert selection and corpus collection are in progress.

## Disclaimer

This is an independent research project created for a technical hiring exercise. It is not an official 100Hires resource or marketing strategy.
