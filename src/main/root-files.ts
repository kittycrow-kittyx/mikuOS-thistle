import type { Kern } from "../../thistle/src/core/kernel.js";
import type { Kind } from "../../thistle/src/fs/vfs.js";

/** Inspect one name through the kernel's public directory listing, without following that name. */
export const rootEntryKind = (k: Kern, parent: string, name: string): Kind | null => {
  for (const [entry, node] of k.fs.list(parent, k.fs.authority)) {
    if (entry === name) return node.kind;
  }
  return null;
};

export const rootPathKind = (k: Kern, path: string): Kind | null => {
  const cut = path.lastIndexOf("/");
  return rootEntryKind(k, path.slice(0, cut) || "/", path.slice(cut + 1));
};

const clearDirectory = (k: Kern, path: string): void => {
  for (const [name, node] of k.fs.list(path, k.fs.authority)) {
    const child = `${path}/${name}`;
    if (node.kind === "dir") clearDirectory(k, child);
    k.fs.rm(child, k.fs.authority, node.kind === "dir");
  }
};

/** Rebuild a volatile mount directory only through kernel namespace operations. */
export const resetLiveDirectory = (k: Kern, name: string): void => {
  const path = "/" + name;
  const kind = rootEntryKind(k, "/", name);
  if (kind === "dir") clearDirectory(k, path);
  if (kind !== null && kind !== "dir") k.fs.rm(path, k.fs.authority);
  if (kind !== "dir") k.fs.mkdir(path, k.fs.authority, 0o755);
  k.fs.chmod(path, 0o755, k.fs.authority);
  k.fs.chown(path, 0, 0, k.fs.authority);
};
