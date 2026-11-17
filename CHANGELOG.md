# Changelog

## 0.1.1

- Fix Esc handling in `/resume`, other selectors, dialogs, and autocomplete: dismissing those interfaces no longer increments the guard or displays an interrupt notification.
- Restrict the guard to the focused main editor, preserving existing custom editor factories and restoring them on cleanup.
- Add regression tests for focus changes, partial press sequences, autocomplete dismissal, reload, and custom editor compatibility.

## 0.1.0

- Require three Esc presses, each within one second of the previous press, before passing an interrupt through to Pi.
- Show an English press counter only after the first Esc press.
- Hide the widget when the counter resets or an agent operation ends.
- Preserve idle Esc behavior and native interrupt handling.
- Ignore Kitty key-release and held-key repeat events.
