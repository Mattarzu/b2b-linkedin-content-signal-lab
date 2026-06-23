import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type Expert = {
  id?: unknown;
  name?: unknown;
  linkedin_url?: unknown;
  rationale?: unknown;
};

type Manifest = {
  schema_version?: unknown;
  topic?: unknown;
  updated_at?: unknown;
  experts?: unknown;
};

const strict = process.argv.includes("--strict");
const manifestPath = resolve(process.cwd(), "research/expert-manifest.json");

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

async function main(): Promise<void> {
  const errors: string[] = [];
  const warnings: string[] = [];

  let manifest: Manifest;

  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  } catch (error) {
    console.error(`Unable to read ${manifestPath}.`);
    console.error(error);
    process.exitCode = 1;
    return;
  }

  if (manifest.schema_version !== "1.0") {
    errors.push('schema_version must be exactly "1.0".');
  }

  if (!isNonEmptyString(manifest.topic)) {
    errors.push("topic must be a non-empty string.");
  }

  if (!Array.isArray(manifest.experts)) {
    errors.push("experts must be an array.");
  }

  const experts = Array.isArray(manifest.experts)
    ? (manifest.experts as Expert[])
    : [];

  if (experts.length === 0) {
    warnings.push(
      "No experts are registered yet. This is expected until the source-selection phase."
    );
  }

  if (strict && experts.length !== 10) {
    errors.push(
      `Strict mode requires exactly 10 experts; found ${experts.length}.`
    );
  }

  const usedIds = new Set<string>();

  experts.forEach((expert, index) => {
    const label = `experts[${index}]`;

    if (!isNonEmptyString(expert.id)) {
      errors.push(`${label}.id must be a non-empty string.`);
    } else {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(expert.id)) {
        errors.push(`${label}.id must use lowercase kebab-case.`);
      }

      if (usedIds.has(expert.id)) {
        errors.push(`${label}.id duplicates "${expert.id}".`);
      }

      usedIds.add(expert.id);
    }

    if (!isNonEmptyString(expert.name)) {
      errors.push(`${label}.name must be a non-empty string.`);
    }

    if (!isNonEmptyString(expert.linkedin_url)) {
      errors.push(`${label}.linkedin_url must be a non-empty string.`);
    } else if (!expert.linkedin_url.startsWith("https://www.linkedin.com/")) {
      errors.push(`${label}.linkedin_url must be a canonical LinkedIn URL.`);
    }

    if (!isNonEmptyString(expert.rationale)) {
      errors.push(`${label}.rationale must explain why the expert was selected.`);
    }
  });

  console.log(`Research manifest: ${experts.length} expert(s) registered.`);

  for (const warning of warnings) {
    console.warn(`Warning: ${warning}`);
  }

  if (errors.length > 0) {
    console.error("\nValidation failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Validation passed.");
}

void main();
