import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

// Use the installed host's own TS loader and keyboard implementation, like Pi.
const root = process.env.PI_PACKAGE_ROOT ?? path.join(
  execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(),
  "@earendil-works/pi-coding-agent",
);
const { createJiti } = await import(pathToFileURL(path.join(root, "dist/core/extensions/jiti-loader.js")));
const jiti = createJiti(import.meta.url, {
  moduleCache: false,
  alias: {
    "@earendil-works/pi-tui": path.join(root, "node_modules/@earendil-works/pi-tui/dist/index.js"),
  },
});
const install = await jiti.import(fileURLToPath(new URL("./index.ts", import.meta.url)), { default: true });

function harness(t, { hasUI = true } = {}) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 10000 });
  const events = new Map();
  const widgets = new Map();
  const notifications = [];
  let input;
  let idle = false;
  let subscriptions = 0;
  const ctx = {
    hasUI,
    isIdle: () => idle,
    ui: {
      setWidget: (key, value) => widgets.set(key, value),
      notify: (message) => notifications.push(message),
      onTerminalInput: (fn) => {
        input = fn;
        subscriptions += 1;
        return () => { input = undefined; subscriptions -= 1; };
      },
    },
  };
  install({ on: (name, fn) => events.set(name, fn) });
  const emit = (name) => events.get(name)?.({}, ctx);
  emit("session_start");
  return {
    emit,
    input: (data = "\x1b") => input?.(data),
    idle: (value) => { idle = value; },
    widget: () => widgets.get("escape-guard")?.join("\n"),
    notifications,
    subscriptions: () => subscriptions,
  };
}

test("blocks first two Esc presses, shows counts, and delivers only the third", (t) => {
  const h = harness(t);
  h.emit("agent_start");
  assert.equal(h.widget(), undefined);
  assert.deepEqual(h.input(), { consume: true });
  assert.match(h.widget(), /Press Esc 3 times to interrupt/);
  assert.match(h.widget(), /1\/3/);
  t.mock.timers.tick(200);
  assert.deepEqual(h.input(), { consume: true });
  assert.match(h.widget(), /2\/3/);
  assert.equal(h.input(), undefined);
  assert.match(h.widget(), /3\/3/);
  assert.equal(h.notifications[0], "Esc: 3/3 — Interrupt requested");
  // A further burst starts over rather than leaking more interrupts.
  assert.deepEqual(h.input(), { consume: true });
  assert.match(h.widget(), /1\/3/);
});

test("timeout hides the counter and starts a new burst", (t) => {
  const h = harness(t);
  h.input();
  t.mock.timers.tick(1001);
  assert.equal(h.widget(), undefined);
  assert.deepEqual(h.input(), { consume: true });
  assert.match(h.widget(), /1\/3/);
});

test("interval is measured between presses, not from the first key", (t) => {
  const h = harness(t);
  h.input();
  t.mock.timers.tick(700);
  h.input();
  t.mock.timers.tick(700);
  assert.equal(h.input(), undefined);
  assert.equal(h.notifications.length, 1);
});

test("non-Esc input resets the burst without being swallowed", (t) => {
  const h = harness(t);
  h.input();
  assert.equal(h.input("x"), undefined);
  assert.equal(h.widget(), undefined);
  h.input();
  assert.match(h.widget(), /1\/3/);
  assert.equal(h.input("\x1b[A"), undefined); // arrow key, not Esc
  assert.equal(h.input("\x1b[200~pasted\x1b[201~"), undefined);
});

test("idle Esc and other keys retain native behavior", (t) => {
  const h = harness(t);
  h.idle(true);
  assert.equal(h.input(), undefined);
  assert.equal(h.input("\x03"), undefined); // Ctrl+C remains native
  assert.equal(h.widget(), undefined);
});

test("Kitty key releases and held-key repeats do not count", (t) => {
  const h = harness(t);
  assert.deepEqual(h.input("\x1b[27u"), { consume: true });
  assert.equal(h.input("\x1b[27;1:3u"), undefined);
  assert.deepEqual(h.input("\x1b[27;1:2u"), { consume: true });
  assert.match(h.widget(), /1\/3/);
  assert.deepEqual(h.input("\x1b[27u"), { consume: true });
  assert.equal(h.input("\x1b[27u"), undefined);
});

test("agent boundaries, session switch, reload and shutdown clean up", (t) => {
  const h = harness(t);
  h.input();
  h.emit("agent_end");
  assert.equal(h.widget(), undefined);
  t.mock.timers.tick(1100);
  assert.equal(h.widget(), undefined);
  h.emit("agent_start");
  assert.equal(h.widget(), undefined);
  h.input();
  h.emit("session_switch");
  assert.equal(h.widget(), undefined);
  h.emit("session_start");
  assert.equal(h.subscriptions(), 1);
  h.emit("session_shutdown");
  assert.equal(h.subscriptions(), 0);
  assert.equal(h.widget(), undefined);
});

test("Pi's native loader accepts the extension and registers its lifecycle hooks", async () => {
  const { loadExtensions } = await import(pathToFileURL(path.join(root, "dist/core/extensions/loader.js")));
  const result = await loadExtensions(
    [fileURLToPath(new URL("./index.ts", import.meta.url))],
    process.cwd(),
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.extensions.length, 1);
  for (const event of ["session_start", "agent_start", "agent_end", "session_switch", "session_shutdown"]) {
    assert.ok(result.extensions[0].handlers.has(event), `Missing handler: ${event}`);
  }
});

test("headless sessions do not subscribe to terminal input", (t) => {
  const h = harness(t, { hasUI: false });
  assert.equal(h.subscriptions(), 0);
  h.emit("agent_start");
  assert.equal(h.widget(), undefined);
  h.emit("session_shutdown");
});
