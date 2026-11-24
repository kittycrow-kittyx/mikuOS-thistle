# main/root-files

Boot-image policy using public upstream filesystem operations and the upstream root credential. `rootFileCred` is the shared boot identity; `rootEntryKind` and `rootPathKind` inspect exact names without following the final link. `resetLiveDirectory` removes volatile entries through checked unlink/rmdir and recreates or normalises the directory. No independent inode map or filesystem mechanism is stored here.
