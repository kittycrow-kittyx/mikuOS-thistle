import { IDENTITY } from "./identity.js";
import { DEFAULT_CONFIG as KERNEL_CONFIG, rootCred, guestCred } from "../../deps/thistle/src/core/config.js";
import type { SystemConfig } from "../../deps/thistle/src/core/config.js";
export { rootCred, guestCred };
export type { SystemConfig, AccountConfig, LocalSessionConfig } from "../../deps/thistle/src/core/config.js";

export const DEFAULT_CONFIG: SystemConfig = {
  kernel: { ...KERNEL_CONFIG.kernel },
  os: {
    name: IDENTITY.os.name,
    prettyName: IDENTITY.os.prettyName,
    id: "mikuos",
    version: IDENTITY.os.version,
    homeUrl: "https://kittycrow.dev/mikuos",
  },
  hostName: "mikuos",
  terminal: {
    term: "xterm-256color",
    lang: "en_GB.UTF-8",
  },
  accounts: {
    cli: {
      name: "root",
      displayName: "root",
      home: "/root",
      shell: "/bin/thsh",
      cred: rootCred(),
    },
    web: {
      name: "guest",
      displayName: "Guest",
      home: "/home/guest",
      shell: "/bin/thsh",
      cred: guestCred(),
    },
  },
  sessions: {
    local: {"account": null, mode: "direct" },
  },
  messages: {
    nativeBanner: "",
    motd: "Welcome to mikuOS v0.3.\nKernel source: Thistle. Run 'help' for userland.\n",
    issue: "初音ミクOS v｡三 \\n \\l\n",
    guestReadme: "This browser/local guest account is unprivileged. Your home is writable.\n",
    halted: "\r\nmikuOS halted.\r\n",
  },
  author: {
    name: "Kitty Crow",
    url: "https://kittycrow.dev",
  },
};
