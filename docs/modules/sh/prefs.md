# sh/prefs

Shell preference parsing validates recognised booleans, bounded integers, key names and script language values. Unknown keys survive text updates; malformed settings produce warnings while valid preferences retain their own typed fields.

Expected validation failures return an explicit message before mutation. Parsing preserves invalid settings and emits the same line warnings without using an exception binding to carry normal validation results.

Public names: `ShellPrefs`, `DEFAULT_PREFS`, `PREF_KEYS`, `defaultPrefs`, `ParsedPrefs`, `parsePrefs`, `preferenceKey`, `preferenceLine`, `prefsText`, `updatePrefsText`, `DEFAULT_PREFS_FILE`.

`preferenceKey` resolves a supplied name against the canonical preference schema.
`preferenceLine` shares the same value formatting between listing and reading one preference.
