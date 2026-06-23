import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type LinkedInPost = {
  id: string;
  expert_id: string;
  author: string;
  canonical_url: string;
  published_at: string;
  captured_at: string;
  format: string;
  themes: string[];
  body: string;
  researcher_note: string;
};

type Queue = {
  schema_version: "1.0";
  updated_at: string | null;
  posts: LinkedInPost[];
};

const queuePath = resolve(process.cwd(), "research/linkedin-capture-queue.json");
const outputRoot = resolve(process.cwd(), "research/linkedin-posts");

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

const supportedFormats = new Set([
  "text-post",
  "carousel",
  "video",
  "article",
  "newsletter"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }

  return value.trim();
}

function isKebabCase(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isLinkedInPostUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const isLinkedIn = host === "linkedin.com";
    const isPostPath =
      url.pathname.includes("/posts/") || url.pathname.includes("/feed/update/");

    return isLinkedIn && isPostPath;
  } catch {
    return false;
  }
}

function parseQueue(raw: unknown): Queue {
  if (!isRecord(raw)) {
    throw new Error("linkedin-capture-queue.json must contain an object.");
  }

  if (raw.schema_version !== "1.0") {
    throw new Error('schema_version must be exactly "1.0".');
  }

  if (raw.updated_at !== null && typeof raw.updated_at !== "string") {
    throw new Error("updated_at must be a string or null.");
  }

  if (!Array.isArray(raw.posts)) {
    throw new Error("posts must be an array.");
  }

  const ids = new Set<string>();

  const posts = raw.posts.map((entry, index): LinkedInPost => {
    if (!isRecord(entry)) {
      throw new Error(`posts[${index}] must be an object.`);
    }

    const id = requireString(entry.id, `posts[${index}].id`);
    const expertId = requireString(entry.expert_id, `posts[${index}].expert_id`);
    const author = requireString(entry.author, `posts[${index}].author`);
    const canonicalUrl = requireString(
      entry.canonical_url,
      `posts[${index}].canonical_url`
    );
    const publishedAt = requireString(
      entry.published_at,
      `posts[${index}].published_at`
    );
    const capturedAt = requireString(
      entry.captured_at,
      `posts[${index}].captured_at`
    );
    const format = requireString(entry.format, `posts[${index}].format`);
    const body = requireString(entry.body, `posts[${index}].body`);
    const researcherNote = requireString(
      entry.researcher_note,
      `posts[${index}].researcher_note`
    );

    if (!Array.isArray(entry.themes) || entry.themes.length === 0) {
      throw new Error(`posts[${index}].themes must contain at least one theme.`);
    }

    const themes = entry.themes.map((theme, themeIndex) =>
      requireString(theme, `posts[${index}].themes[${themeIndex}]`)
    );

    if (!isKebabCase(id)) {
      throw new Error(`posts[${index}].id must use lowercase kebab-case.`);
    }

    if (!isKebabCase(expertId)) {
      throw new Error(`posts[${index}].expert_id must use lowercase kebab-case.`);
    }

    if (ids.has(id)) {
      throw new Error(`Duplicate LinkedIn post id: "${id}".`);
    }

    if (!isLinkedInPostUrl(canonicalUrl)) {
      throw new Error(
        `posts[${index}].canonical_url must be a LinkedIn post or feed-update URL.`
      );
    }

    if (!isDate(publishedAt) || !isDate(capturedAt)) {
      throw new Error(
        `posts[${index}].published_at and captured_at must use YYYY-MM-DD.`
      );
    }

    if (!supportedFormats.has(format)) {
      throw new Error(
        `posts[${index}].format must be one of: ${[...supportedFormats].join(", ")}.`
      );
    }

    ids.add(id);

    return {
      id,
      expert_id: expertId,
      author,
      canonical_url: canonicalUrl,
      published_at: publishedAt,
      captured_at: capturedAt,
      format,
      themes,
      body,
      researcher_note: researcherNote
    };
  });

  return {
    schema_version: "1.0",
    updated_at: raw.updated_at as string | null,
    posts
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function renderPost(post: LinkedInPost): string {
  const themeLines = post.themes
    .map((theme) => `  - ${yamlString(theme)}`)
    .join("\n");

  return `---
author: ${yamlString(post.author)}
expert_id: ${yamlString(post.expert_id)}
source_id: ${yamlString(post.id)}
published_at: ${yamlString(post.published_at)}
captured_at: ${yamlString(post.captured_at)}
canonical_url: ${yamlString(post.canonical_url)}
format: ${yamlString(post.format)}
collection_method: "manual"
themes:
${themeLines}
---

# LinkedIn post by ${post.author}

## Captured post

${post.body}

## Researcher note

${post.researcher_note}
`;
}

async function main(): Promise<void> {
  const raw = JSON.parse(await readFile(queuePath, "utf8")) as unknown;
  const queue = parseQueue(raw);

  console.log(`LinkedIn capture queue: ${queue.posts.length} post(s).`);

  if (queue.posts.length === 0) {
    console.warn("No posts queued yet. Add manually verified LinkedIn posts.");
    return;
  }

  let rendered = 0;
  let skipped = 0;

  for (const post of queue.posts) {
    const directory = resolve(outputRoot, post.expert_id);
    const outputPath = resolve(directory, `${post.published_at}--${post.id}.md`);

    if (dryRun) {
      console.log(`[dry-run] ${post.author}: ${outputPath}`);
      continue;
    }

    if ((await fileExists(outputPath)) && !force) {
      console.log(`Skipped existing post: ${outputPath}`);
      skipped += 1;
      continue;
    }

    await mkdir(directory, { recursive: true });
    await writeFile(outputPath, renderPost(post), "utf8");

    console.log(`Rendered: ${outputPath}`);
    rendered += 1;
  }

  console.log(`Summary: ${rendered} rendered, ${skipped} skipped.`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
