// Each history line is independently decoded; non-string JSON is kept verbatim.
type HistoryValue = string | number | boolean | null | object;
const parseHistory: (line: string) => HistoryValue = JSON.parse;
export const decodeHistory=(src:string):string[]=>src.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n").filter(Boolean).map(line=>{try{const x=parseHistory(line);return typeof x==="string"?x:line;}catch{return line;}});
export const encodeHistory=(entries:readonly string[]):string=>entries.map(x=>JSON.stringify(x)).join("\n")+(entries.length?"\n":"");
export const historyMatches = (entries: readonly string[], prefix: string, caseSensitive: boolean): string[] => {
  if (!prefix) return [];
  const needle = caseSensitive ? prefix : prefix.toLocaleLowerCase();
  const out: string[] = [], seen = new Set<string>();
  // Reduce from the newest entry so duplicate commands keep their latest place.
  return entries.reduceRight((matches, entry) => {
    if (entry.includes("\n")) return matches;
    const candidate = caseSensitive ? entry : entry.toLocaleLowerCase();
    if (!candidate.startsWith(needle) || entry === prefix || seen.has(entry)) return matches;
    seen.add(entry);
    matches.push(entry);
    return matches;
  }, out);
};
const esc=(x:string):string=>x.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
export const globMatches=(pattern:string,value:string):boolean=>{let rx="^";for(const c of pattern)rx+=c==="*"?".*":c==="?"?".":esc(c);try{return new RegExp(rx+"$").test(value);}catch{return false;}};
