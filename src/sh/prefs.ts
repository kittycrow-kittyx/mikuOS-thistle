// Global and per-user mikuOS preferences.
import { keyBindingWarnings } from "./keys.js";

export interface ShellPrefs {
  autocomplete: boolean;
  autocompleteCaseSensitive: boolean;
  autocompleteColour: string;
  history: boolean;
  historySize: number;
  historyDeduplicate: boolean;
  historyIgnoreSpace: boolean;
  historyTimestamps: boolean;
  historyIgnorePatterns: string[];
  historyPrefixSearch: boolean;
  reverseSearch: boolean;
  ctrlSForwardSearch: boolean;
  heredocSilent: boolean;
  heredocPrompt: string;
  defaultScriptLang: "thsh" | "bash";
  clearScrollback: boolean;
  colour: boolean;
  bell: boolean;
  showWelcome: boolean;
  promptFormat: string;
  completionListLimit: number;

  keyCompleteNext: string;
  keyCompletePrevious: string;
  keySuggestionOlder: string;
  keySuggestionNewer: string;
  keySuggestionAccept: string;
  keySuggestionAcceptWord: string;
  keySuggestionSuppress: string;
  keyHistoryPrevious: string;
  keyHistoryNext: string;
  keyHistorySearchReverse: string;
  keyHistorySearchForward: string;
}

export const DEFAULT_PREFS: Readonly<ShellPrefs> = {
  autocomplete: true,
  autocompleteCaseSensitive: true,
  autocompleteColour: "grey",
  history: true,
  historySize: 1000,
  historyDeduplicate: true,
  historyIgnoreSpace: true,
  historyTimestamps: false,
  historyIgnorePatterns: ["passwd *", "export *TOKEN*", "export *PASSWORD*", "export *SECRET*"],
  historyPrefixSearch: true,
  reverseSearch: true,
  ctrlSForwardSearch: true,
  heredocSilent: false,
  heredocPrompt: "> ",
  defaultScriptLang: "thsh",
  clearScrollback: true,
  colour: true,
  bell: false,
  showWelcome: true,
  promptFormat: "\\u@\\h:\\w\\$ ",
  completionListLimit: 100,

  keyCompleteNext: "Tab",
  keyCompletePrevious: "Shift+Tab",
  keySuggestionOlder: "Alt+Up",
  keySuggestionNewer: "Alt+Down",
  keySuggestionAccept: "End",
  keySuggestionAcceptWord: "Alt+Right",
  keySuggestionSuppress: "Escape",
  keyHistoryPrevious: "Up",
  keyHistoryNext: "Down",
  keyHistorySearchReverse: "Ctrl+R",
  keyHistorySearchForward: "Ctrl+S",
};

export const PREF_KEYS = Object.freeze(Object.keys(DEFAULT_PREFS) as Array<keyof ShellPrefs>);

/** Resolve an interactive preference name against the complete supported schema. */
export const preferenceKey = (name: string | null): keyof ShellPrefs | null => {
  for (const key of PREF_KEYS) if (key === name) return key;
  return null;
};
export const defaultPrefs = (): ShellPrefs => ({
  ...DEFAULT_PREFS,
  historyIgnorePatterns: [...DEFAULT_PREFS.historyIgnorePatterns],
});

const keyPreferenceNames = new Set<keyof ShellPrefs>([
  "keyCompleteNext",
  "keyCompletePrevious",
  "keySuggestionOlder",
  "keySuggestionNewer",
  "keySuggestionAccept",
  "keySuggestionAcceptWord",
  "keySuggestionSuppress",
  "keyHistoryPrevious",
  "keyHistoryNext",
  "keyHistorySearchReverse",
  "keyHistorySearchForward",
]);

const unquote = (input: string): string => {
  const value = input.trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  return value;
};

const booleanValue = (value: string): number => {
  const normal = value.trim().toLowerCase();
  if (["true", "yes", "on", "1"].includes(normal)) return 1;
  if (["false", "no", "off", "0"].includes(normal)) return 0;
  return -1;
};

const integerValue = (value: string, minimum: number, maximum: number): number => {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    return NaN;
  }
  return parsed;
};

export interface ParsedPrefs {
  prefs: ShellPrefs;
  warnings: string[];
  unknown: Map<string, string>;
}

const applyBooleanPreference = (prefs: ShellPrefs, key: string, value: string): number => {
  switch (key) {
    case "autocomplete":
    case "autocompleteCaseSensitive":
    case "history":
    case "historyDeduplicate":
    case "historyIgnoreSpace":
    case "historyTimestamps":
    case "historyPrefixSearch":
    case "reverseSearch":
    case "ctrlSForwardSearch":
    case "heredocSilent":
    case "clearScrollback":
    case "colour":
    case "bell":
    case "showWelcome": {
      const parsed = booleanValue(value);
      if (parsed < 0) return -1;
      prefs[key] = parsed === 1;
      return 1;
    }
    default: return 0;
  }
};

const applyTextPreference = (prefs: ShellPrefs, key: string, value: string): boolean => {
  switch (key) {
    case "autocompleteColour":
    case "heredocPrompt":
    case "promptFormat":
    case "keyCompleteNext":
    case "keyCompletePrevious":
    case "keySuggestionOlder":
    case "keySuggestionNewer":
    case "keySuggestionAccept":
    case "keySuggestionAcceptWord":
    case "keySuggestionSuppress":
    case "keyHistoryPrevious":
    case "keyHistoryNext":
    case "keyHistorySearchReverse":
    case "keyHistorySearchForward":
      prefs[key] = unquote(value);
      return true;
    default: return false;
  }
};

const applyPreference = (prefs: ShellPrefs, key: string, value: string, unknown: Map<string, string>): string | null => {
  // Decode before assignment so a rejected setting preserves its previous value.
  const boolean = applyBooleanPreference(prefs, key, value);
  if (boolean < 0) return `${key}: expected true or false`;
  if (boolean > 0 || applyTextPreference(prefs, key, value)) return null;
  switch (key) {
    case "historySize": {
      const parsed = integerValue(value, 0, 1_000_000);
      if (Number.isNaN(parsed)) return `${key}: expected 0..1000000`;
      prefs.historySize = parsed;
      break;
    }
    case "completionListLimit": {
      const parsed = integerValue(value, 1, 100_000);
      if (Number.isNaN(parsed)) return `${key}: expected 1..100000`;
      prefs.completionListLimit = parsed;
      break;
    }

    case "historyIgnorePatterns":
      prefs.historyIgnorePatterns = unquote(value).split(",").map(item => item.trim()).filter(Boolean);
      break;

    case "defaultScriptLang": {
      const language = unquote(value);
      if (language !== "thsh" && language !== "bash") {
        return `${key}: expected thsh or bash`;
      }
      prefs.defaultScriptLang = language;
      break;
    }
    default: unknown.set(key, unquote(value));
  }
  return null;
};

// Validation precedes mutation so failures leave the current operation in a defined state.
export const parsePrefs = (source: string, initial: ShellPrefs = defaultPrefs()): ParsedPrefs => {
  // Invalid values preserve the initial setting and produce a line warning; unknown keys remain available for round trips.
  const prefs: ShellPrefs = {
    ...initial,
    historyIgnorePatterns: [...initial.historyIgnorePatterns],
  };
  const warnings: string[] = [];
  const unknown = new Map<string, string>();

  for (const [index, raw] of source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const at = line.indexOf("=");
    if (at < 1) {
      warnings.push(`line ${index + 1}: expected key=value`);
      continue;
    }

    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();

    const warning = applyPreference(prefs, key, value, unknown);
    if (warning !== null) warnings.push(`line ${index + 1}: ${warning}`);
  }

  for (const key of keyPreferenceNames) {
    for (const warning of keyBindingWarnings(String(prefs[key]))) {
      warnings.push(`${String(key)}: ${warning}`);
    }
  }

  return { prefs, warnings, unknown };
};

const valueText = <T>(value: T): string =>
  Array.isArray(value)
    ? JSON.stringify(value.join(","))
    : typeof value === "string"
      ? JSON.stringify(value)
      : String(value);

export const preferenceLine = (prefs: ShellPrefs, key: keyof ShellPrefs): string =>
  `${String(key)}=${valueText(prefs[key])}`;

export const prefsText = (prefs: ShellPrefs): string =>
  PREF_KEYS.map(key => preferenceLine(prefs, key)).join("\n") + "\n";

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const updatePrefsText = (source: string, key: string, value: string): string => {
  const lines = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const expression = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  let found = false;
  const output = lines.map(line => {
    if (found || !expression.test(line)) return line;
    found = true;
    return `${key}=${value}`;
  });
  if (!found) output.push(`${key}=${value}`);
  return output.join("\n").replace(/\n*$/, "\n");
};

export const DEFAULT_PREFS_FILE = `# mikuOS preferences
# Edit active key=value lines, then run: prefs reload

autocomplete=true
#autocomplete=false
autocompleteCaseSensitive=true
autocompleteColour="grey"

history=true
historySize=1000
historyDeduplicate=true
historyIgnoreSpace=true
historyTimestamps=false
historyIgnorePatterns="passwd *,export *TOKEN*,export *PASSWORD*,export *SECRET*"
historyPrefixSearch=true
#historyPrefixSearch=false

reverseSearch=true
ctrlSForwardSearch=true

heredocSilent=false
heredocPrompt="> "

defaultScriptLang="thsh"
#defaultScriptLang="bash"

clearScrollback=true
colour=true
bell=false
showWelcome=true
promptFormat="\\\\u@\\\\h:\\\\w\\\\$ "
completionListLimit=100

# Symbolic key bindings. Comma-separated alternatives are supported.
# A raw terminal sequence can be written as Hex:1b5b46.
keyCompleteNext="Tab"
keyCompletePrevious="Shift+Tab"
keySuggestionOlder="Alt+Up"
keySuggestionNewer="Alt+Down"
keySuggestionAccept="End"
keySuggestionAcceptWord="Alt+Right"
keySuggestionSuppress="Escape"
keyHistoryPrevious="Up"
keyHistoryNext="Down"
keyHistorySearchReverse="Ctrl+R"
keyHistorySearchForward="Ctrl+S"
`;
