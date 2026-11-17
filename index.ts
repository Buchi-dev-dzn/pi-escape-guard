import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isKeyRelease, isKeyRepeat, matchesKey } from "@earendil-works/pi-tui";

const REQUIRED_PRESSES = 3;
const INTERVAL_MS = 1000;
const WIDGET = "escape-guard";

/** Keep native cancellation semantics, but only deliver every third deliberate Esc. */
export default function escapeGuard(pi: ExtensionAPI) {
  let context: ExtensionContext | undefined;
  let unsubscribe: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let presses = 0;
  let lastPress = 0;

  function render(message?: string) {
    if (!context?.hasUI) return;
    context.ui.setWidget(WIDGET, [
      message ?? `Esc: ${presses}/${REQUIRED_PRESSES} — Press Esc 3 times to interrupt (within 1s of each press)`,
    ]);
  }

  function reset() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    presses = 0;
    lastPress = 0;
    if (context?.hasUI) context.ui.setWidget(WIDGET, undefined);
  }

  pi.on("session_start", (_event, ctx) => {
    unsubscribe?.();
    reset();
    context = ctx;
    if (!ctx.hasUI) return;

    unsubscribe = ctx.ui.onTerminalInput((data) => {
      // Do not change idle editor / menu behavior, or count Kitty key-up events.
      if (ctx.isIdle()) {
        reset();
        return;
      }
      if (isKeyRelease(data)) return;
      if (!matchesKey(data, "escape")) {
        if (presses > 0) reset();
        return;
      }
      // A held key is not three deliberate presses (when reported by the terminal).
      if (isKeyRepeat(data)) return { consume: true };

      const now = Date.now();
      if (now - lastPress > INTERVAL_MS) presses = 0;
      lastPress = now;
      presses += 1;
      if (timer) clearTimeout(timer);

      if (presses === REQUIRED_PRESSES) {
        reset();
        render("Esc: 3/3 — Interrupt requested");
        ctx.ui.notify("Esc: 3/3 — Interrupt requested", "info");
        // Let Pi handle the third key, including queued-message restoration,
        // retry cancellation, and other native interrupt behavior.
        return;
      }

      render();
      timer = setTimeout(() => reset(), INTERVAL_MS);
      timer.unref?.();
      return { consume: true };
    });
  });

  pi.on("agent_start", (_event, ctx) => {
    context = ctx;
    reset();
  });
  pi.on("agent_end", () => reset());
  pi.on("session_switch", (_event, ctx) => {
    context = ctx;
    reset();
  });
  pi.on("session_shutdown", () => {
    unsubscribe?.();
    unsubscribe = undefined;
    reset();
    context = undefined;
  });
}
