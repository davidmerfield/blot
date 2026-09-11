const { AsyncLocalStorage } = require("async_hooks");
const fs = require("fs-extra");
const { join } = require("path");
const context = new AsyncLocalStorage();
const active = new Map();

function cancelled() {
  const error = new Error("Import cancelled");
  error.name = "AbortError";
  return error;
}

function create(directory) {
  const controller = new AbortController();
  const marker = join(directory, "cancelled.txt");
  const state = {
    signal: controller.signal,
    bytes: 0,
    assets: new Set(),
    check() {
      if (fs.existsSync(marker)) controller.abort(cancelled());
      if (controller.signal.aborted) throw controller.signal.reason;
    },
    abort: (error = cancelled()) => controller.abort(error),
  };
  // Imports and cancellation requests can be handled by different Node workers.
  // The durable marker is authoritative; polling also interrupts active I/O.
  const timer = setInterval(() => {
    if (fs.existsSync(marker)) controller.abort(cancelled());
  }, 250);
  timer.unref();
  active.set(directory, state);
  state.dispose = () => {
    clearInterval(timer);
    active.delete(directory);
  };
  state.run = (fn) => context.run(state, fn);
  return state;
}

async function cancel(directory) {
  await fs.outputFile(join(directory, "cancelled.txt"), "true");
  if (active.has(directory)) active.get(directory).abort();
}

function check() {
  const state = context.getStore();
  if (state) state.check();
}

function guard(step) {
  return function (...args) {
    const next = args[args.length - 1];
    try {
      check();
      step(...args);
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { create, cancel, check, guard, current: () => context.getStore(), cancelled };
