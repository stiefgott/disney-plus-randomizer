"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const local = {};
const session = {};
const tabs = new Map();
const windows = new Map();
const USER_WINDOW_ID = 7;
const USER_TAB_ID = 1;
const userTab = { id: USER_TAB_ID, active: true, url: "https://www.disneyplus.com/de-de/home", windowId: USER_WINDOW_ID };
tabs.set(USER_TAB_ID, userTab);
windows.set(USER_WINDOW_ID, { id: USER_WINDOW_ID, focused: true, state: "normal", type: "normal", tabs: [userTab] });
let nextTabId = 11;
let nextWindowId = 21;
let supportsMinimizedWindows = true;
let windowCreateCalls = 0;
let windowUpdateCalls = 0;
let messageListener = null;
let removedListener = null;
let updatedListener = null;

function area(store) {
  return {
    get(keys, callback) {
      const list = Array.isArray(keys) ? keys : [keys];
      callback(Object.fromEntries(list.map((key) => [key, store[key]])));
    },
    set(values, callback) {
      Object.assign(store, values);
      callback?.();
    },
    remove(keys, callback) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key];
      callback?.();
    }
  };
}

const chrome = {
  commands: { onCommand: { addListener() {} } },
  runtime: {
    lastError: null,
    onInstalled: { addListener() {} },
    onMessage: { addListener(listener) { messageListener = listener; } }
  },
  storage: { local: area(local), session: area(session) },
  tabs: {
    create(options, callback) {
      const tab = { id: nextTabId++, ...options };
      tabs.set(tab.id, tab);
      callback(tab);
    },
    onRemoved: { addListener(listener) { removedListener = listener; } },
    onUpdated: { addListener(listener) { updatedListener = listener; } },
    query(options, callback) {
      callback([...tabs.values()].filter((tab) => {
        if (options?.windowId != null && tab.windowId !== options.windowId) return false;
        if (options?.currentWindow && tab.windowId !== USER_WINDOW_ID) return false;
        if (options?.active != null && tab.active !== options.active) return false;
        return true;
      }));
    },
    remove(tabId, callback) {
      tabs.delete(tabId);
      callback?.();
    },
    sendMessage() {},
    update(tabId, options, callback) {
      const tab = { ...tabs.get(tabId), ...options };
      tabs.set(tabId, tab);
      callback(tab);
    }
  },
  windows: {
    create(options, callback) {
      windowCreateCalls += 1;
      const requestedMinimized = options.state === "minimized";
      const window = {
        id: nextWindowId++,
        focused: requestedMinimized && !supportsMinimizedWindows ? true : options.focused,
        state: requestedMinimized && !supportsMinimizedWindows ? "normal" : options.state || "normal",
        type: options.type || "normal",
        tabs: []
      };
      const tab = { id: nextTabId++, active: true, url: options.url, windowId: window.id };
      window.tabs.push(tab);
      tabs.set(tab.id, tab);
      windows.set(window.id, window);
      callback(window);
    },
    getLastFocused(_options, callback) {
      callback([...windows.values()].find((window) => window.focused) || windows.get(USER_WINDOW_ID));
    },
    update(windowId, options, callback) {
      windowUpdateCalls += 1;
      const current = windows.get(windowId);
      const nextOptions = options.state === "minimized" && !supportsMinimizedWindows
        ? { ...options, state: "normal" }
        : options;
      if (nextOptions.focused) {
        for (const [id, value] of windows) windows.set(id, { ...value, focused: id === windowId });
      }
      const window = { ...current, ...nextOptions };
      windows.set(windowId, window);
      callback(window);
    },
    remove(windowId, callback) {
      const window = windows.get(windowId);
      for (const tab of window?.tabs || []) tabs.delete(tab.id);
      windows.delete(windowId);
      callback?.();
    },
    onRemoved: { addListener() {} }
  }
};

vm.runInNewContext(fs.readFileSync(require.resolve("../background.js"), "utf8"), {
  URL,
  chrome,
  console,
  Math,
  Promise,
  Date
});

function send(message, sender = {}) {
  return new Promise((resolve) => {
    const async = messageListener(message, sender, resolve);
    if (async !== true) resolve(undefined);
  });
}

(async () => {
  const started = await send({ type: "DP_RANDOM_SITE_READY", url: "https://www.disneyplus.com/de-de/home" });
  assert.equal(started.ok, true);
  assert.equal(started.started, true);
  const scan = local["dpRandom.autoScan.v1"];
  assert.equal(tabs.get(scan.tabId).url, "https://www.disneyplus.com/de-de/browse/series");
  assert.equal(scan.mode, "background-tab");
  assert.equal(scan.windowId, null);
  assert.equal(scan.returnWindowId, USER_WINDOW_ID);
  assert.equal(tabs.get(scan.tabId).windowId, USER_WINDOW_ID);
  assert.equal(tabs.get(scan.tabId).active, false);
  assert.equal(windows.get(USER_WINDOW_ID).focused, true);
  assert.equal(windowCreateCalls, 0);
  assert.equal(windowUpdateCalls, 0);

  const check = await send({ type: "DP_RANDOM_AUTOSCAN_CHECK" }, { tab: { id: scan.tabId } });
  assert.equal(check.scan.scanId, scan.scanId);
  local["dpRandom.catalog.v1"] = [
    { url: "current", availabilityScanId: scan.scanId },
    { url: "old", availabilityScanId: "older-scan" }
  ];

  for (let index = 0; index < 6; index += 1) {
    await send({ type: "DP_RANDOM_AUTOSCAN_DONE", result: { ok: true } }, { tab: { id: scan.tabId } });
  }
  assert.equal(local["dpRandom.autoScan.v1"].active, false);
  assert.deepEqual(local["dpRandom.catalog.v1"].map((item) => item.url), ["current"]);
  assert.equal(tabs.has(scan.tabId), false);
  assert.equal(windows.size, 1);
  assert.equal(typeof removedListener, "function");
  assert.equal(typeof updatedListener, "function");

  delete session["dpRandom.autoScanStarted"];
  const freshStart = await send({ type: "DP_RANDOM_SITE_READY", url: "https://www.disneyplus.com/de-de/home" });
  assert.equal(freshStart.fresh, true);
  assert.equal(windows.size, 1);

  const studioStart = await send({ type: "DP_RANDOM_START_AUTOSCAN", url: "https://www.disneyplus.com/de-de/home" });
  assert.equal(studioStart.ok, true);
  const studioScan = local["dpRandom.autoScan.v1"];
  for (let index = 0; index < 3; index += 1) {
    await send({ type: "DP_RANDOM_AUTOSCAN_DONE", result: { ok: true } }, { tab: { id: studioScan.tabId } });
  }
  await send({
    type: "DP_RANDOM_AUTOSCAN_DONE",
    result: { ok: true, studioRoutes: [{ path: "browse/marvel", label: "Marvel", studio: "Marvel", brand: "Disney+" }] }
  }, { tab: { id: studioScan.tabId } });
  assert.equal(tabs.get(studioScan.tabId).url, "https://www.disneyplus.com/de-de/browse/marvel");
  assert.equal(local["dpRandom.autoScan.v1"].routes[4].studio, "Marvel");
  for (let index = 0; index < 3; index += 1) {
    await send({ type: "DP_RANDOM_AUTOSCAN_DONE", result: { ok: true } }, { tab: { id: studioScan.tabId } });
  }
  assert.equal(local["dpRandom.autoScan.v1"].active, false);

  const rejected = await send({ type: "DP_RANDOM_START_AUTOSCAN", url: "https://www.disneyplus.com/identity/logout" });
  assert.equal(rejected.ok, false);

  local["dpRandom.catalog.v1"] = [{ url: "keep-on-error", availabilityScanId: "old" }];
  const restarted = await send({ type: "DP_RANDOM_START_AUTOSCAN", url: "https://www.disneyplus.com/de-de/home" });
  assert.equal(restarted.ok, true);
  const failedScan = local["dpRandom.autoScan.v1"];
  for (let index = 0; index < 6; index += 1) {
    await send({ type: "DP_RANDOM_AUTOSCAN_DONE", result: { ok: index !== 0 } }, { tab: { id: failedScan.tabId } });
  }
  assert.deepEqual(local["dpRandom.catalog.v1"].map((item) => item.url), ["keep-on-error"]);
  assert.equal(local["dpRandom.autoScan.v1"].errors, 1);

  local["dpRandom.catalog.v1"] = [{ url: "keep-after-empty-scan", availabilityScanId: "old" }];
  const emptyStarted = await send({ type: "DP_RANDOM_START_AUTOSCAN", url: "https://www.disneyplus.com/de-de/home" });
  assert.equal(emptyStarted.ok, true);
  const emptyScan = local["dpRandom.autoScan.v1"];
  for (let index = 0; index < 6; index += 1) {
    await send({ type: "DP_RANDOM_AUTOSCAN_DONE", result: { ok: true, scanCount: 0 } }, { tab: { id: emptyScan.tabId } });
  }
  assert.deepEqual(local["dpRandom.catalog.v1"].map((item) => item.url), ["keep-after-empty-scan"]);
  assert.equal(local["dpRandom.autoScan.v1"].errors, 1);

  local["dpRandom.catalog.v1"] = [{ url: "keep-after-timeout", availabilityScanId: "old" }];
  const timeoutStarted = await send({ type: "DP_RANDOM_START_AUTOSCAN", url: "https://www.disneyplus.com/de-de/home" });
  assert.equal(timeoutStarted.ok, true);
  const timeoutScan = local["dpRandom.autoScan.v1"];
  local["dpRandom.autoScan.v1"] = { ...timeoutScan, startedAt: Date.now() - (16 * 60 * 1000) };
  const timeoutResult = await send({ type: "DP_RANDOM_AUTOSCAN_DONE", result: { ok: true } }, { tab: { id: timeoutScan.tabId } });
  assert.equal(timeoutResult.timedOut, true);
  assert.equal(local["dpRandom.autoScan.v1"].active, false);
  assert.equal(local["dpRandom.autoScan.v1"].timedOut, true);
  assert.deepEqual(local["dpRandom.catalog.v1"].map((item) => item.url), ["keep-after-timeout"]);
  assert.equal(tabs.has(timeoutScan.tabId), false);

  await send({ type: "DP_RANDOM_START_AUTOSCAN", url: "https://www.disneyplus.com/de-de/home" });
  const authScan = local["dpRandom.autoScan.v1"];
  updatedListener(authScan.tabId, { url: "https://www.disneyplus.com/identity/logout" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(local["dpRandom.autoScan.v1"].active, false);
  assert.equal(local["dpRandom.autoScan.v1"].abortReason, "Disney+ ist nicht sicher angemeldet");
  assert.equal(session["dpRandom.autoScanStarted"], undefined);

  const playbackPriorityStart = await send({ type: "DP_RANDOM_START_AUTOSCAN", url: "https://www.disneyplus.com/de-de/home" });
  assert.equal(playbackPriorityStart.ok, true);
  const playbackPriorityResult = await send({ type: "DP_RANDOM_PLAYER_ACTIVE" }, { tab: { id: 999 } });
  assert.equal(playbackPriorityResult.stopped, true);
  assert.equal(local["dpRandom.autoScan.v1"].active, false);
  assert.equal(local["dpRandom.autoScan.v1"].abortReason, "Wiedergabe hat Vorrang");

  const diaStarted = await send({ type: "DP_RANDOM_START_AUTOSCAN", url: "https://www.disneyplus.com/de-de/home" });
  assert.equal(diaStarted.ok, true);
  const diaScan = local["dpRandom.autoScan.v1"];
  assert.equal(diaScan.mode, "background-tab");
  assert.equal(diaScan.windowId, null);
  assert.equal(tabs.get(diaScan.tabId).windowId, USER_WINDOW_ID);
  assert.equal(tabs.get(diaScan.tabId).active, false);
  assert.equal(windows.get(USER_WINDOW_ID).focused, true);
  for (let index = 0; index < 6; index += 1) {
    await send({ type: "DP_RANDOM_AUTOSCAN_DONE", result: { ok: true } }, { tab: { id: diaScan.tabId } });
  }
  assert.equal(tabs.has(diaScan.tabId), false);
  assert.equal(windowCreateCalls, 0);
  assert.equal(windowUpdateCalls, 0);
  console.log("background: Scan bleibt in inaktivem Tab und berührt den Fensterfokus nicht");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
