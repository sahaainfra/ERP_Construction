// Legacy crosswalk from Part 00 Annex D: old prompts (00–166) to the Parts that now own them,
// plus the VERIFY & EXTEND list, consolidations, module-code aliases and the uploaded module crosswalks.
// Data is generated from docs/program/annex-d-legacy-mapping.md by scripts/build-legacy-crosswalk.mjs.

import data from "./legacy.generated.json";
import { getPart, type PartRecord } from "./index";

export interface CrosswalkRow {
  oldPrompt: string;
  oldTitle: string;
  formerId: string | null;
  legacyBuilt: boolean;
  newParts: string[];
}

export interface VerifyExtendRow {
  part: string;
  title: string;
  legacyBuiltPrompts: string[];
  stillToBuildPrompts: string[];
}

export interface AliasRow {
  part: string;
  moduleCode: string;
  legacyCodes: string[];
}

export interface ModuleCrosswalkRow {
  modulePart: string;
  title: string;
  nowInParts: string[];
  nowInText: string;
  notes: string;
}

export const CROSSWALK: readonly CrosswalkRow[] = data.crosswalk;
export const VERIFY_EXTEND: readonly VerifyExtendRow[] = data.verifyExtend;
export const CONSOLIDATIONS = data.consolidations;
export const ALIASES: readonly AliasRow[] = data.aliases;
export const PLANT_MODULE: readonly ModuleCrosswalkRow[] = data.plantModule;
export const WORKCHAT_MODULE: readonly ModuleCrosswalkRow[] = data.workchatModule;

/** Parts that now own an old prompt. */
export function partsForLegacyPrompt(oldPrompt: string): string[] {
  const row = CROSSWALK.find((r) => r.oldPrompt === oldPrompt);
  if (!row) throw new RangeError(`Unknown legacy prompt ${oldPrompt}`);
  return row.newParts;
}

/** Old prompts whose work now sits in a Part (the crosswalk, read the other way). */
export function legacyPromptsForPart(part: string): string[] {
  return CROSSWALK.filter((r) => r.newParts.includes(part)).map((r) => r.oldPrompt);
}

/**
 * How a Part starts: VERIFY & EXTEND where legacy code already exists (Annex D2 and E6), otherwise the
 * default mode from the Annex C index.
 */
export function startMode(part: string): PartRecord["defaultMode"] | "VERIFY & EXTEND" {
  return VERIFY_EXTEND.some((r) => r.part === part) ? "VERIFY & EXTEND" : getPart(part).defaultMode;
}

/** Legacy module codes kept as aliases for a Part. Built identifiers are never renamed (Annex D preamble). */
export function aliasesFor(part: string): string[] {
  return ALIASES.find((a) => a.part === part)?.legacyCodes ?? [];
}

/** Every legacy prompt number a VERIFY & EXTEND Part consolidates: those already built and those still to build. */
export function legacyIdsFor(row: VerifyExtendRow): string[] {
  return [...row.legacyBuiltPrompts, ...row.stillToBuildPrompts];
}
