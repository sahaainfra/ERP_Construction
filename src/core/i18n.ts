// Message catalogue and locale formatting (Part 05 REQ-CORE-F16; Annex A DS-31). Hindi text is a draft that needs review.
export const SUPPORTED_LOCALES = ["en-IN", "hi-IN"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const MESSAGES: Record<Locale, Record<string, string>> = {
  "en-IN": {
    "error.VALIDATION_FAILED": "Some values are not valid.",
    "error.FORBIDDEN": "You do not have permission for this action.",
    "error.INTERNAL_ERROR": "Something went wrong on our side.",
  },
  "hi-IN": {
    "error.VALIDATION_FAILED": "कुछ मान मान्य नहीं हैं।",
    "error.FORBIDDEN": "इस कार्य के लिए आपके पास अनुमति नहीं है।",
    "error.INTERNAL_ERROR": "हमारी ओर से कुछ गड़बड़ हुई।",
  },
};

export function translate(locale: string, key: string): string {
  const table = MESSAGES[(SUPPORTED_LOCALES as readonly string[]).includes(locale) ? (locale as Locale) : "en-IN"];
  return table[key] ?? MESSAGES["en-IN"][key] ?? key;
}

/** Indian digit grouping (12,34,567.00) for a value in paise, shown in rupees with two decimals (DS-31). */
export function formatInrFromPaise(paise: number): string {
  if (!Number.isInteger(paise)) throw new RangeError("amount must be an integer number of paise");
  const negative = paise < 0;
  const absolute = Math.abs(paise);
  const rupees = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  const digits = String(rupees);
  let grouped: string;
  if (digits.length <= 3) grouped = digits;
  else {
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3);
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
  }
  return `${negative ? "-" : ""}${grouped}.${fraction}`;
}
