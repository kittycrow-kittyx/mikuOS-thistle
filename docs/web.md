# Static browser build

```sh
bun run web
bun run serve:web
```

The `dist/web/` site loads the pinned Thistle TypeScript kernel and custom root image locally. The browser requires no remote kernel process. `bootloader.js` and `boot-standalone.js` are generated from TypeScript sources.

`BootRenderer` retains the original ANSI boot panel, logo, mobile crop, colours, progress and spinner. Its timer remains 150 milliseconds. Terminal grid centring and alternate-screen restoration are handled by the loader. The regression fixture records the original renderer output for identical input sequences.
