import { BootRenderer } from "./display.js";
import { withValue } from "../../thistle/src/core/err.js";
export interface BootTerminal {
  element: HTMLElement | null | null;
  cols: number | null;
  rows: number | null;
  write(text: string): void;
  onResize: ((listener: (size: { cols: number; rows: number }) => void) => { dispose(): void }) | null;
}

export interface BootDisplay {
  report(phase: number, done: number | null, total: number | null): void;
  finish(): void;
  fail<T>(error: T): void;
  dispose(): void;
}

export interface BootApi {
  create(terminal: BootTerminal, base: string | URL | null): Promise<BootDisplay>;
  loadRuntime(url: string): Promise<void>;
}

// The early renderer runs before the main runtime bundle.
(function (global: typeof globalThis & { MikuBoot: BootApi | null }) {
  "use strict";

  // xterm.js lays out complete character cells from the left edge. The
  // remaining fractional width ends up on the right, which visibly shifts
  // a centred ANSI panel left. Centre the rendered grid within the actual
  // terminal viewport during boot, then restore its original placement.
  function centreBootGrid(terminal: BootTerminal) {
    const host = (terminal.element ?? null);
    if (!host) return { align() {}, restore() {} };
    const screen = host.querySelector<HTMLElement>(".xterm-screen");
    if (!screen) {
      return { align() {}, restore() {} };
    }

    const previous = screen.style.transform;
    const align = (): void => {
      screen.style.transform = previous;
      const viewport = host.getBoundingClientRect();
      const grid = screen.getBoundingClientRect();
      const offset = Math.round(
        viewport.left + viewport.width / 2 - grid.left - grid.width / 2
      );
      if (Number.isFinite(offset) && offset !== 0) {
        screen.style.transform = (previous ? previous + " " : "") +
          "translateX(" + offset + "px)";
      }
    };
    align();
    return { align, restore() { screen.style.transform = previous; } };
  }

  async function create(terminal: BootTerminal, base: string | URL | null = null): Promise<BootDisplay> {
    const renderer = new BootRenderer(text => terminal.write(text));
    let finished = false;
    const alignment = centreBootGrid(terminal);
    renderer.start(terminal.cols || 60, terminal.rows || 24);
    const spinner = setInterval(() => { if (!finished) renderer.tick(); }, 150);
    const resize = withValue(terminal.onResize ?? null, callable => callable.call(terminal, size => {
      alignment.align();
      renderer.resize(size.cols, size.rows);
    }));
    const display: BootDisplay = {
      report(phase: number, done = 0, total = 0) {
        if (!finished) renderer.update(phase, done ?? 0, total ?? 0);
      },
      finish() {
        if (finished) return;
        renderer.update(8, 0, 0);
        finished = true;
        clearInterval(spinner);
        withValue(resize ?? null, value => value.dispose());
        renderer.finish();
        alignment.restore();
      },
      fail<T>(error: T) {
        if (finished) return;
        this.finish();
        terminal.write("\r\nmikuOS boot failed: " +
          (error instanceof Error ? error.message : String(error)) + "\r\n");
      },
      dispose() {
        if (!finished) {
          finished = true;
          clearInterval(spinner);
          withValue(resize ?? null, value => value.dispose());
          renderer.finish();
          alignment.restore();
        }
      },
    };
    return display;
  }

  // Starts a real browser script request. No blob URLs or dynamic evaluation.
  function loadRuntime(url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.setAttribute("data-mikuos-embed", "true");
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Unable to load mikuOS runtime"));
      document.head.appendChild(script);
    });
  }

  global.MikuBoot = Object.freeze({ create, loadRuntime });
})(globalThis as typeof globalThis & { MikuBoot: BootApi | null });
