# Data Schema

## Expert manifest

`research/expert-manifest.json` is the structured index of selected experts.

Required expert fields:

```json
{
  "id": "lowercase-kebab-case",
  "name": "Full name",
  "linkedin_url": "https://www.linkedin.com/in/...",
  "rationale": "Why this person is a high-signal source for this research."
}
LinkedIn post file

Files in research/linkedin-posts/ use Markdown with YAML front matter.

---
author: Full name
expert_id: lowercase-kebab-case
published_at: YYYY-MM-DD | unknown
captured_at: YYYY-MM-DD
canonical_url: https://www.linkedin.com/posts/...
format: text-post | carousel | video | article | newsletter
themes:
  - buyer-education
collection_method: manual
---

# Post opening line or descriptive title

> Faithful excerpt or concise post summary.

## Researcher note

- Core claim:
- Content mechanism:
- Intended audience:
- Why it is relevant:
- Evidence strength: high | medium
YouTube transcript file

Files in research/youtube-transcripts/ use Markdown with YAML front matter.

---
expert: Full name
expert_id: lowercase-kebab-case
video_title: Video title
video_url: https://www.youtube.com/watch?v=...
published_at: YYYY-MM-DD | unknown
collected_at: YYYY-MM-DD
collection_method: transcript-api
provider: Supadata
language: en
---

# Transcript

[00:00] Transcript segment

## Video queue

`research/video-queue.json` is the controlled input for the transcript collector.

~~~json
{
  "schema_version": "1.0",
  "updated_at": "YYYY-MM-DD",
  "videos": [
    {
      "id": "video-topic-slug",
      "expert_id": "lowercase-kebab-case",
      "expert_name": "Full name",
      "title": "Exact public video title",
      "url": "https://www.youtube.com/watch?v=...",
      "published_at": "YYYY-MM-DD",
      "themes": [
        "buyer-education",
        "content-distribution"
      ]
    }
  ]
}
~~~

The collector defaults to `mode=native`, which requests only existing transcripts. Use `--allow-generated` only after explicitly accepting that AI-generated transcripts may consume additional API credits.

## LinkedIn capture queue

`research/linkedin-capture-queue.json` is the controlled input for manually captured LinkedIn posts.

```json
{
  "schema_version": "1.0",
  "updated_at": "YYYY-MM-DD",
  "posts": [
    {
      "id": "author-yyyy-mm-dd-topic-slug",
      "expert_id": "lowercase-kebab-case",
      "author": "Full name",
      "canonical_url": "https://www.linkedin.com/posts/...",
      "published_at": "YYYY-MM-DD",
      "captured_at": "YYYY-MM-DD",
      "format": "text-post",
      "themes": [
        "buyer-education",
        "founder-led-content"
      ],
      "body": "Manually captured post content.",
      "researcher_note": "Core claim, mechanism, intended audience, and relevance."
    }
  ]
}
Posts are captured manually from LinkedIn. The renderer validates metadata and writes Markdown files under research/linkedin-posts/<expert-id>/.
