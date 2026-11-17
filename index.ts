import { CustomEditor, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isKeyRelease, isKeyRepeat, matchesKey } from "@earendil-works/pi-tui";

type EditorFactory = NonNullable<ReturnType<ExtensionContext["ui"]["getEditorComponent"]>>;

const REQUIRED_PRESSES = 3;
const INTERVAL_MS = 1000;
const WIDGET = "escape-guard";

/** Keep native cancellation semantics, but only deliver every third deliberate Esc. */
export default function escapeGuard(pi: ExtensionAPI) {
  let context: ExtensionContext | undefined;
  let unsubscribe: (() => void) | undefined;
  let restoreEditor: (() => void) | undefined;
  let activeEditor: ReturnType<EditorFactory> | undefined;
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
    unsubscribe = undefined;
    restoreEditor?.();
    restoreEditor = undefined;
    reset();
    context = ctx;
    if (!ctx.hasUI) return;

    // The public getter returns a factory, not the live editor. Wrap that
    // factory to retain the instance whose focus Pi updates for native menus.
    const previousFactory = ctx.ui.getEditorComponent();
    const factory: EditorFactory = (...args) => {
      activeEditor = previousFactory ? previousFactory(...args) : new CustomEditor(...args);
      return activeEditor;
    };
    restoreEditor = () => {
      // Do not overwrite an editor installed by another extension after us.
      if (ctx.ui.getEditorComponent() === factory) ctx.ui.setEditorComponent(previousFactory);
      activeEditor = undefined;
    };
    ctx.ui.setEditorComponent(factory);

    unsubscribe = ctx.ui.onTerminalInput((data) => {
      // Native selectors (/resume, /tree), dialogs and autocomplete own Esc
      // while open. Fail open for custom editors that do not expose focus.
      const editorFocused = activeEditor && "focused" in activeEditor && activeEditor.focused === true;
      const autocompleteOpen = activeEditor && "isShowingAutocomplete" in activeEditor
        && typeof activeEditor.isShowingAutocomplete === "function" && activeEditor.isShowingAutocomplete();
      if (ctx.isIdle() || !editorFocused || autocompleteOpen) {
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
    restoreEditor?.();
    restoreEditor = undefined;
    reset();
    context = undefined;
  });
}
