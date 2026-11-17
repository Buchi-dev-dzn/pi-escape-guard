# Changelog

## 0.1.0

- Require three Esc presses, each within one second of the previous press, before passing an interrupt through to Pi.
- Show an English press counter only after the first Esc press.
- Hide the widget when the counter resets or an agent operation ends.
- Preserve idle Esc behavior and native interrupt handling.
- Ignore Kitty key-release and held-key repeat events.
