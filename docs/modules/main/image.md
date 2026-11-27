# main/image

Image creation installs guest directories, accounts, device nodes, rescue commands and example executables into a new kernel. It applies the configured identity and permissions before a session becomes available.

Public names: `ROOT_IMAGE_VERSION`, `migrateImage`, `identity`, `image`, `live`.

Stock migrations inspect exact names without following user-supplied links. Existing entries, including dangling links, are preserved. Volatile `/dev` and `/proc` directories are rebuilt through the kernel's public namespace operations, never by mutating an internal directory map.
