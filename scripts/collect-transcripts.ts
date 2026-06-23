import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type VideoSource = {
  id: string;
  expert_id: string;
  expert_name: string;
  title: string;
  url: string;
  published_at: string;
  themes: string[];
};

type VideoQueue = {
  schema_version: "1.0";
  updated_at: string | null;
  videos: VideoSource[];
};

type TranscriptSegment = {
  text: string;
  offset_ms: number;
};

type TranscriptResult = {
  language: string;
  segments: TranscriptSegment[];
};

const API_BASE_URL = "https://api.supadata.ai/v1";
const queuePath = resolve(process.cwd(), "research/video-queue.json");
const outputDirectory = resolve(process.cwd(), "research/youtube-transcripts");

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const allowGenerated = process.argv.includes("--allow-generated");
const requestMode = allowGenerated ? "auto" : "native";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }

  return value.trim();
}

function parsePublishedAt(value: unknown, field: string): string {
  if (value === "unknown") {
    return value;
  }

  const date = requireString(value, field);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${field} must be YYYY-MM-DD or "unknown".`);
  }

  return date;
}

function parseTags(value: unknown, field: string): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array of strings.`);
  }

  return value.map((tag, index) => requireString(tag, `${field}[${index}]`));
}

function isKebabCase(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");

    return host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be";
  } catch {
    return false;
  }
}

function parseQueue(raw: unknown): VideoQueue {
  if (!isRecord(raw)) {
    throw new Error("video-queue.json must contain an object.");
  }

  if (raw.schema_version !== "1.0") {
    throw new Error('schema_version must be exactly "1.0".');
  }

  if (raw.updated_at !== null && typeof raw.updated_at !== "string") {
    throw new Error("updated_at must be a string or null.");
  }

  if (!Array.isArray(raw.videos)) {
    throw new Error("videos must be an array.");
  }

  const seenIds = new Set<string>();

  const videos = raw.videos.map((entry, index): VideoSource => {
    if (!isRecord(entry)) {
      throw new Error(`videos[${index}] must be an object.`);
    }

    const id = requireString(entry.id, `videos[${index}].id`);
    const expertId = requireString(entry.expert_id, `videos[${index}].expert_id`);
    const expertName = requireString(entry.expert_name, `videos[${index}].expert_name`);
    const title = requireString(entry.title, `videos[${index}].title`);
    const url = requireString(entry.url, `videos[${index}].url`);
    const publishedAt = parsePublishedAt(
      entry.published_at,
      `videos[${index}].published_at`
    );
    const themes = parseTags(entry.themes, `videos[${index}].themes`);

    if (!isKebabCase(id)) {
      throw new Error(`videos[${index}].id must use lowercase kebab-case.`);
    }

    if (!isKebabCase(expertId)) {
      throw new Error(`videos[${index}].expert_id must use lowercase kebab-case.`);
    }

    if (!isYouTubeUrl(url)) {
      throw new Error(`videos[${index}].url must be a YouTube URL.`);
    }

    if (seenIds.has(id)) {
      throw new Error(`Duplicate video id: "${id}".`);
    }

    seenIds.add(id);

    return {
      id,
      expert_id: expertId,
      expert_name: expertName,
      title,
      url,
      published_at: publishedAt,
      themes
    };
  });

  return {
    schema_version: "1.0",
    updated_at: raw.updated_at as string | null,
    videos
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function formatTimestamp(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const twoDigits = (value: number): string => String(value).padStart(2, "0");

  return hours > 0
    ? `${twoDigits(hours)}:${twoDigits(minutes)}:${twoDigits(seconds)}`
    : `${twoDigits(minutes)}:${twoDigits(seconds)}`;
}

function asErrorMessage(payload: unknown): string {
  if (!isRecord(payload)) {
    return "Unknown API error.";
  }

  if (typeof payload.error === "string") {
    return payload.error;
  }

  if (typeof payload.message === "string") {
    return payload.message;
  }

  return JSON.stringify(payload);
}

function normalizeTranscript(payload: unknown): TranscriptResult {
  if (!isRecord(payload)) {
    throw new Error("Transcript response is not a JSON object.");
  }

  const language = typeof payload.lang === "string" ? payload.lang : "unknown";
  const content = payload.content;

  if (typeof content === "string") {
    const text = content.trim();

    if (!text) {
      throw new Error("Transcript content is empty.");
    }

    return {
      language,
      segments: [{ text, offset_ms: 0 }]
    };
  }

  if (!Array.isArray(content)) {
    throw new Error("Transcript response does not contain usable content.");
  }

  const segments = content
    .filter(isRecord)
    .map((segment): TranscriptSegment | null => {
      const text = typeof segment.text === "string" ? segment.text.trim() : "";
      const offset = typeof segment.offset === "number" ? segment.offset : 0;

      if (!text) {
        return null;
      }

      return {
        text,
        offset_ms: offset
      };
    })
    .filter((segment): segment is TranscriptSegment => segment !== null);

  if (segments.length === 0) {
    throw new Error("Transcript response contains no usable segments.");
  }

  return { language, segments };
}

async function readResponseJson(response: Response): Promise<unknown> {
  const text = await response.text();

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Expected JSON from Supadata, received: ${text.slice(0, 300)}`);
  }
}

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function pollTranscriptJob(apiKey: string, jobId: string): Promise<TranscriptResult> {
  const maxAttempts = 60;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await wait(1000);

    const response = await fetch(`${API_BASE_URL}/transcript/${jobId}`, {
      headers: {
        Accept: "application/json",
        "x-api-key": apiKey
      }
    });

    const payload = await readResponseJson(response);

    if (!response.ok) {
      throw new Error(
        `Supadata job polling failed with HTTP ${response.status}: ${asErrorMessage(payload)}`
      );
    }

    if (!isRecord(payload)) {
      throw new Error("Supadata job response is not an object.");
    }

    if (payload.status === "completed") {
      return normalizeTranscript(payload);
    }

    if (payload.status === "failed") {
      throw new Error(`Supadata transcript job failed: ${asErrorMessage(payload)}`);
    }

    console.log(`  Job ${jobId}: ${String(payload.status ?? "unknown")} (${attempt}/${maxAttempts})`);
  }

  throw new Error(`Supadata job ${jobId} did not complete within ${maxAttempts} seconds.`);
}

async function requestTranscript(
  apiKey: string,
  source: VideoSource
): Promise<TranscriptResult> {
  const endpoint = new URL(`${API_BASE_URL}/transcript`);

  endpoint.searchParams.set("url", source.url);
  endpoint.searchParams.set("lang", "en");
  endpoint.searchParams.set("text", "false");
  endpoint.searchParams.set("mode", requestMode);

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "x-api-key": apiKey
    }
  });

  const payload = await readResponseJson(response);

  if (response.status === 200) {
    return normalizeTranscript(payload);
  }

  if (response.status === 202) {
    if (!isRecord(payload) || typeof payload.jobId !== "string") {
      throw new Error("Supadata returned HTTP 202 without a jobId.");
    }

    return pollTranscriptJob(apiKey, payload.jobId);
  }

  throw new Error(
    `Supadata request failed with HTTP ${response.status}: ${asErrorMessage(payload)}`
  );
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function renderTranscript(source: VideoSource, transcript: TranscriptResult): string {
  const collectedAt = new Date().toISOString().slice(0, 10);

  const themeLines =
    source.themes.length > 0
      ? source.themes.map((theme) => `  - ${yamlString(theme)}`).join("\n")
      : "  - \"unclassified\"";

  const body = transcript.segments
    .map((segment) => `[${formatTimestamp(segment.offset_ms)}] ${segment.text}`)
    .join("\n\n");

  return `---
expert: ${yamlString(source.expert_name)}
expert_id: ${yamlString(source.expert_id)}
source_id: ${yamlString(source.id)}
video_title: ${yamlString(source.title)}
video_url: ${yamlString(source.url)}
published_at: ${yamlString(source.published_at)}
collected_at: ${yamlString(collectedAt)}
collection_method: "Supadata Transcript API"
provider: "Supadata"
request_mode: ${yamlString(requestMode)}
language: ${yamlString(transcript.language)}
themes:
${themeLines}
---

# ${source.title}

## Provenance

- Expert: ${source.expert_name}
- Video: ${source.url}
- Collection mode: ${requestMode}
- Transcript provider: Supadata

## Transcript

${body}
`;
}

async function main(): Promise<void> {
  const queueRaw = JSON.parse(await readFile(queuePath, "utf8")) as unknown;
  const queue = parseQueue(queueRaw);

  console.log(`Transcript queue: ${queue.videos.length} video(s).`);
  console.log(`Collection mode: ${requestMode}.`);

  if (queue.videos.length === 0) {
    console.warn("No videos queued yet. Add verified YouTube sources before collecting.");
    return;
  }

  await mkdir(outputDirectory, { recursive: true });

  if (!dryRun && !process.env.SUPADATA_API_KEY) {
    throw new Error(
      "SUPADATA_API_KEY is missing. Copy .env.example to .env and add the API key."
    );
  }

  let collected = 0;
  let skipped = 0;
  let failed = 0;

  for (const source of queue.videos) {
    const outputPath = resolve(
      outputDirectory,
      `${source.expert_id}--${source.id}.md`
    );

    if (dryRun) {
      console.log(`[dry-run] ${source.expert_name}: ${source.title}`);
      console.log(`          ${outputPath}`);
      continue;
    }

    if ((await fileExists(outputPath)) && !force) {
      console.log(`Skipped existing transcript: ${outputPath}`);
      skipped += 1;
      continue;
    }

    try {
      console.log(`Collecting: ${source.expert_name} — ${source.title}`);
      const transcript = await requestTranscript(
        process.env.SUPADATA_API_KEY as string,
        source
      );

      await writeFile(outputPath, renderTranscript(source, transcript), "utf8");

      console.log(`  Saved ${transcript.segments.length} segment(s).`);
      collected += 1;
    } catch (error) {
      console.error(`  Failed: ${error instanceof Error ? error.message : String(error)}`);
      failed += 1;
    }
  }

  console.log(`\nSummary: ${collected} collected, ${skipped} skipped, ${failed} failed.`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
