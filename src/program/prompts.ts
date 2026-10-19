// Session prompts from Part 00 Annex E, filled from the program index (Annex C) and the legacy crosswalk (Annex D).
// Templates are generated from docs/program/annex-e-session-prompts.md by scripts/build-session-prompts.mjs.

import data from "./prompts.generated.json";
import { getPart, PHASES, PARTS } from "./index";
import { legacyIdsFor, startMode, VERIFY_EXTEND } from "./legacy";

export interface PromptTemplate {
  id: string;
  heading: string;
  text: string;
}

export const TEMPLATES: readonly PromptTemplate[] = data.templates;

// Tags the annex uses to wrap attached documents. The session owner fills these by attaching files.
const XML_TAGS = new Set(["context", "constitution", "part", "annex_sections", "task", "steps", "rules"]);

export interface RenderedPrompt {
  text: string;
  /** Placeholders the generator could not fill. Fill them by hand before pasting. */
  unfilled: string[];
}

export interface PartOptions {
  /** Slice label such as "S2". Defaults to all slices. */
  slice?: string;
  /** Repository path or link. */
  repo?: string;
}

export function getTemplate(id: string): PromptTemplate {
  const found = TEMPLATES.find((t) => t.id === id);
  if (!found) throw new RangeError(`Unknown prompt template ${id}. Available: ${TEMPLATES.map((t) => t.id).join(", ")}`);
  return found;
}

/** Lists placeholders left in the text, ignoring the XML tags that wrap attached documents. */
export function findPlaceholders(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/<([A-Za-z][^<>\n]*)>/g)) {
    if (!XML_TAGS.has(match[1])) found.add(`<${match[1]}>`);
  }
  return [...found];
}

function replaceAll(text: string, from: string, to: string): string {
  return text.split(from).join(to);
}

/** Renders a template for one Part (E1, E1-legacy, E2, E3, E5, E6, E7, E8). */
export function renderPartPrompt(templateId: string, partId: string, options: PartOptions = {}): RenderedPrompt {
  const template = getTemplate(templateId);
  if (templateId === "E4") throw new RangeError("E4 is a phase gate; use renderPhaseGate");
  const part = getPart(partId);
  const mode = startMode(partId);
  const slice = options.slice ?? "all";
  const repo = options.repo ?? "/home/user/ERP_Construction";

  let text = template.text;
  text = replaceAll(text, "<NN>", partId);
  text = replaceAll(text, "<TITLE>", part.title);
  text = replaceAll(text, "<code>", part.code);
  text = replaceAll(text, "<S#/all>", slice);
  text = replaceAll(text, "<S#>", slice);
  text = replaceAll(text, "<BUILD | EXTEND | VERIFY & EXTEND>", mode);
  text = replaceAll(text, "<repo path or link>", repo);

  if (templateId === "E1-legacy") {
    text = replaceAll(text, "<list>", part.dependsOn.join(", ") || "none");
  }

  if (templateId === "E6") {
    const legacy = VERIFY_EXTEND.find((r) => r.part === partId);
    if (!legacy) throw new RangeError(`E6 applies only to VERIFY & EXTEND Parts; ${partId} starts in ${mode}`);
    text = replaceAll(text, "<old ids>", legacyIdsFor(legacy).join(", "));
  }

  return { text, unfilled: findPlaceholders(text) };
}

/** Renders the E4 phase gate for a phase number from Annex C1. */
export function renderPhaseGate(phase: number): RenderedPrompt {
  const record = PHASES.find((p) => p.phase === phase);
  if (!record) throw new RangeError(`No phase ${phase}`);
  let text = getTemplate("E4").text;
  text = replaceAll(text, "<n>", String(record.phase));
  text = replaceAll(text, "<name>", record.name);
  return { text, unfilled: findPlaceholders(text) };
}

export const PART_IDS = PARTS.map((p) => p.id);
