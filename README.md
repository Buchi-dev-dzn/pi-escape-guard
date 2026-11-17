# pi-escape-guard

[![npm version](https://img.shields.io/npm/v/pi-escape-guard)](https://www.npmjs.com/package/pi-escape-guard)
[![Tests](https://github.com/Buchi-dev-dzn/pi-escape-guard/actions/workflows/test.yml/badge.svg)](https://github.com/Buchi-dev-dzn/pi-escape-guard/actions/workflows/test.yml)

Prevent accidental interruptions in [Pi](https://pi.dev). Press **Esc three times** to interrupt an active agent operation, instead of stopping it with a single accidental press.

The counter stays hidden until you press Esc. All on-screen instructions and notifications are in English.

## Installation

```sh
pi install npm:pi-escape-guard
```

Run `/reload` in an existing Pi session, or restart Pi.

> If you already have a local copy of Escape Guard, disable it before loading this package. Two copies can intercept the same key presses.

## How it works

The first Esc press during an active operation displays a widget above the editor:

```text
Esc: 1/3 — Press Esc 3 times to interrupt (within 1s of each press)
```

- The first two Esc presses are swallowed; the second updates the counter to `2/3`.
- The third press is passed through to Pi, and an `Esc: 3/3 — Interrupt requested` notification is displayed.
- Each press must arrive within one second of the previous press.
- The widget disappears and the counter resets after one second without another press, another key, the end of an agent run, or a session switch.
- Nothing is displayed before the first Esc press.
- Idle Esc behavior and Ctrl+C remain unchanged.

The extension preserves Pi's native interrupt behavior, including restoring queued messages to the editor.

## Scope and limitations

- Protection applies when `ctx.isIdle()` is false, including agent processing and automatic retries. Standalone `!` shell commands while the agent is idle and direct aborts from other extensions are not protected.
- Esc is intercepted at the terminal input layer during active operations. Dismissing a dialog shown during an operation may also require three presses. The third press goes to the currently focused component; it does not bypass a dialog to abort the agent.
- Kitty key-release and held-key repeat events do not count. Terminals that do not report repeats cannot distinguish holding Esc from pressing it repeatedly.
- Non-interactive sessions are unaffected.

## Development

No build step or runtime dependency installation is required. Pi loads `index.ts` directly and provides the host APIs declared in `peerDependencies`.

Tests require Node.js 22.19+ and a global npm installation of Pi. CI tests Node.js 22, 24, and 26 with Pi 1.5.2:

```sh
npm install --global @earendil-works/pi-coding-agent@1.5.2
npm test
npm pack --dry-run
```

For other installations, set `PI_PACKAGE_ROOT` to the `@earendil-works/pi-coding-agent` package directory before running tests. Tests use the installed host's TypeScript loader and keyboard implementation.

To try the checkout without installing it:

```sh
pi -e ./index.ts
```

Disable any installed copy first to avoid duplicate input handlers.

## Contributing

Bug reports and focused pull requests are welcome. When reporting an input issue, include your Pi version, Node.js version, terminal application, and whether Kitty keyboard protocol is enabled. Do not include API keys or private session content.

Run `npm test` and `npm pack --dry-run` before submitting changes. Keep the extension free of runtime dependencies and preserve native idle key behavior.

## Links

- [npm package](https://www.npmjs.com/package/pi-escape-guard)
- [Source and issues](https://github.com/Buchi-dev-dzn/pi-escape-guard)
- [Releases](https://github.com/Buchi-dev-dzn/pi-escape-guard/releases)

## License

MIT. See [LICENSE](./LICENSE).
