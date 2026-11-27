# main/root-files

Boot-image policy uses public upstream filesystem operations with `k.fs.authority`, the canonical root process. `rootEntryKind` and `rootPathKind` inspect exact names without following the final link. `resetLiveDirectory` removes volatile entries through checked unlink/rmdir and recreates or normalises the directory. This module holds no independent credential, inode map or filesystem mechanism.
