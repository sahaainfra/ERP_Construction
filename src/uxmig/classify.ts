// Screen classification (Part 15 REQ-UXMIG-F01; A-137). Pure rules over the facts the scanner reads from a screen. The rules are
// stated here so a reviewer can check each class against its facts.
export type Classification = "verify_only" | "restyle" | "refactor_to_template" | "rebuild";

export interface ScreenFacts {
  route: string;
  module: string;
  file: string;
  /** Components declared in the screen's own file (not imported from the library). */
  localComponents: string[];
  /** Colour, font-size or spacing literals found in the screen's source (not tokens). */
  literalCount: number;
  /** Library template the screen uses, or null. */
  template: string | null;
  /** Local copies of library components (see duplicates.ts). */
  duplicateVariants: number;
}

/**
 * verify_only: uses a template, no literals, no local copies. Its only work is to prove it.
 * restyle: uses a template but still has literals or local copies. Its structure is right; its styling is not.
 * refactor_to_template: no template, but few enough local components to move onto one.
 * rebuild: no template and too many local components to refactor safely.
 */
export const REFACTOR_COMPONENT_LIMIT = 3;

export function classify(facts: ScreenFacts): Classification {
  if (facts.template !== null) {
    return facts.literalCount === 0 && facts.duplicateVariants === 0 ? "verify_only" : "restyle";
  }
  return facts.localComponents.length <= REFACTOR_COMPONENT_LIMIT ? "refactor_to_template" : "rebuild";
}
