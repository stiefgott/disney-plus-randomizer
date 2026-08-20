"use strict";

const SETTINGS_KEY = "dpRandom.settings.v1";
const FILTER_KEY = "dpRandom.filter.v1";
const CATALOG_KEY = "dpRandom.catalog.v1";
const AUTO_SCAN_KEY = "dpRandom.autoScan.v1";
const AUTO_SCAN_SESSION_KEY = "dpRandom.autoScanStarted";
const AUTO_SCAN_MIN_INTERVAL = 12 * 60 * 60 * 1000;
const AUTO_SCAN_MAX_DURATION = 15 * 60 * 1000;
const MAX_DISCOVERED_STUDIO_ROUTES = 12;
const AUTO_SCAN_ROUTES = [
  { path: "browse/series", label: "Serien" },
  { path: "browse/movies", label: "Filme" },
  { path: "browse/originals", label: "Originals" },
  { path: "browse/disneyplus", label: "Disney+" },
  { path: "browse/hulu", label: "Hulu" },
  { path: "home", label: "Startseite & Weiterschauen" }
];

function localGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function localSet(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

function sessionGet(keys) {
  return new Promise((resolve) => chrome.storage.session.get(keys, resolve));
}

function sessionSet(values) {
  return new Promise((resolve) => chrome.storage.session.set(values, resolve));
}

function sessionRemove(keys) {
  return new Promise((resolve) => chrome.storage.session.remove(keys, resolve));
}

function createTab(options) {
  return new Promise((resolve) => chrome.tabs.create(options, (tab) => {
    if (chrome.runtime.lastError) return resolve(null);
    resolve(tab || null);
  }));
}

function queryTabs(options) {
  return new Promise((resolve) => chrome.tabs.query(options, (tabs) => resolve(tabs || [])));
}

function updateTab(tabId, options) {
  return new Promise((resolve) => chrome.tabs.update(tabId, options, resolve));
}

function removeTab(tabId) {
  if (!Number.isInteger(tabId)) return Promise.resolve();
  return new Promise((resolve) => chrome.tabs.remove(tabId, () => {
    void chrome.runtime.lastError;
    resolve();
  }));
}

async function closeScanSurface(scan) {
  // Removing the scan tab also closes a legacy one-tab scan window. This avoids
  // all native window/focus manipulation, which is unstable in some Dia builds.
  await removeTab(scan?.tabId);
}

function safeScanRoutes(value) {
  const routes = Array.isArray(value) ? value : AUTO_SCAN_ROUTES;
  return routes
    .map((route) => typeof route === "string" ? { path: route, label: route } : route)
    .filter((route) => /^browse\/[a-z0-9-]+$|^home$/i.test(route?.path || ""))
    .map((route) => ({
      path: route.path,
      label: String(route.label || route.studio || route.path).slice(0, 60),
      ...(route.studio ? { studio: String(route.studio).slice(0, 60), brand: "Disney+" } : {})
    }));
}

function mergeDiscoveredStudioRoutes(routes, routeIndex, discovered) {
  if (!Array.isArray(discovered) || !discovered.length) return routes;
  const known = new Set(routes.map((route) => route.path));
  const studios = safeScanRoutes(discovered)
    .filter((route) => route.studio && !known.has(route.path))
    .slice(0, MAX_DISCOVERED_STUDIO_ROUTES);
  if (!studios.length) return routes;
  return [...routes.slice(0, routeIndex + 1), ...studios, ...routes.slice(routeIndex + 1)];
}

async function createBackgroundScanTab() {
  const activeTabs = await queryTabs({ active: true, currentWindow: true });
  const activeTab = activeTabs[0] || null;
  const backgroundTab = await createTab({
    active: false,
    url: "about:blank",
    ...(Number.isInteger(activeTab?.windowId) ? { windowId: activeTab.windowId } : {})
  });
  return backgroundTab?.id ? {
    mode: "background-tab",
    returnWindowId: activeTab?.windowId || null,
    tabId: backgroundTab.id,
    windowId: null
  } : null;
}

function safeSiteBase(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!/(^|\.)disneyplus\.com$/i.test(url.hostname)) return null;
    const locale = url.pathname.match(/^\/[a-z]{2}-[a-z]{2}(?=\/|$)/i)?.[0] || "";
    const appPath = url.pathname.slice(locale.length) || "/";
    if (!/^\/(?:home|browse(?:\/|$))/i.test(appPath)) return null;
    if (/\/(?:identity|login|logout|account)(?:\/|$)/i.test(appPath)) return null;
    return `${url.origin}${locale}`;
  } catch (_error) {
    return null;
  }
}

async function abortAutomaticScan(scan, reason) {
  if (!scan?.active) return;
  await localSet({
    [AUTO_SCAN_KEY]: {
      ...scan,
      active: false,
      abortedAt: Date.now(),
      abortReason: reason
    }
  });
  await sessionRemove(AUTO_SCAN_SESSION_KEY);
  await closeScanSurface(scan);
}

async function startAutomaticScan(rawUrl, force = false) {
  const base = safeSiteBase(rawUrl);
  if (!base) return { ok: false, error: "Keine gültige Disney+-Adresse" };
  const session = await sessionGet(AUTO_SCAN_SESSION_KEY);
  const local = await localGet(AUTO_SCAN_KEY);
  if (!force && session[AUTO_SCAN_SESSION_KEY]) {
    return { ok: true, alreadyRunning: Boolean(local[AUTO_SCAN_KEY]?.active) };
  }
  const previousScan = local[AUTO_SCAN_KEY];
  const recentlyCompleted = previousScan?.completedAt &&
    previousScan.errors === 0 &&
    previousScan.base === base &&
    Date.now() - previousScan.completedAt < AUTO_SCAN_MIN_INTERVAL;
  if (!force && recentlyCompleted) {
    await sessionSet({ [AUTO_SCAN_SESSION_KEY]: true });
    return { ok: true, fresh: true, completedAt: previousScan.completedAt };
  }
  if (previousScan?.active) {
    await localSet({ [AUTO_SCAN_KEY]: { ...previousScan, active: false, restartedAt: Date.now() } });
    await closeScanSurface(previousScan);
  }

  await sessionSet({ [AUTO_SCAN_SESSION_KEY]: true });
  const surface = await createBackgroundScanTab();
  if (!surface?.tabId) return { ok: false, error: "Inaktiver Scan-Tab konnte nicht geöffnet werden" };
  const routes = safeScanRoutes(AUTO_SCAN_ROUTES);
  const scan = {
    active: true,
    base,
    errors: 0,
    routeIndex: 0,
    routes,
    scanId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    startedAt: Date.now(),
    mode: surface.mode,
    returnWindowId: surface.returnWindowId,
    tabId: surface.tabId,
    windowId: surface.windowId
  };
  await localSet({ [AUTO_SCAN_KEY]: scan });
  await updateTab(surface.tabId, { url: `${base}/${routes[0].path}` });
  return { ok: true, started: true };
}

async function finishAutomaticScan(scan) {
  const stored = await localGet(CATALOG_KEY);
  const catalog = Array.isArray(stored[CATALOG_KEY]) ? stored[CATALOG_KEY] : [];
  const scannedCatalog = catalog.filter((item) => item?.availabilityScanId === scan.scanId);
  const scanProducedTitles = scannedCatalog.length > 0;
  const currentCatalog = scan.errors === 0 && scanProducedTitles ? scannedCatalog : catalog;
  const completed = {
    ...scan,
    active: false,
    completedAt: Date.now(),
    count: currentCatalog.length,
    errors: scanProducedTitles ? scan.errors : Math.max(1, scan.errors),
    collectedCount: scannedCatalog.length
  };
  await localSet({ [AUTO_SCAN_KEY]: completed, [CATALOG_KEY]: currentCatalog });
  await sessionSet({ [AUTO_SCAN_SESSION_KEY]: true });
  await closeScanSurface(scan);
}

async function advanceAutomaticScan(senderTabId, result) {
  const stored = await localGet(AUTO_SCAN_KEY);
  const scan = stored[AUTO_SCAN_KEY];
  if (!scan?.active || scan.tabId !== senderTabId) return { ok: false, ignored: true };
  if (Date.now() - scan.startedAt >= AUTO_SCAN_MAX_DURATION) {
    await finishAutomaticScan({
      ...scan,
      errors: scan.errors + 1,
      lastResult: { ok: false, error: "Zeitlimit des Katalogabgleichs erreicht" },
      timedOut: true
    });
    return { ok: true, complete: true, timedOut: true };
  }
  const currentRoutes = safeScanRoutes(scan.routes);
  const routes = mergeDiscoveredStudioRoutes(currentRoutes, scan.routeIndex, result?.studioRoutes);
  const next = {
    ...scan,
    collectedCount: Math.max(Number(scan.collectedCount) || 0, Number(result?.scanCount) || 0),
    errors: scan.errors + (result?.ok ? 0 : 1),
    lastResult: result || null,
    routeIndex: scan.routeIndex + 1,
    routes
  };
  if (next.routeIndex >= routes.length) {
    await finishAutomaticScan(next);
    return { ok: true, complete: true };
  }
  await localSet({ [AUTO_SCAN_KEY]: next });
  await updateTab(next.tabId, { url: `${next.base}/${routes[next.routeIndex].path}` });
  return { ok: true, complete: false };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([SETTINGS_KEY, FILTER_KEY], (result) => {
    const defaults = {};
    if (!result[SETTINGS_KEY]) {
      defaults[SETTINGS_KEY] = {
        autoplay: true,
        shufflePlayback: false,
        skipWatchedEpisodes: false
      };
    }
    if (!result[FILTER_KEY]) {
      defaults[FILTER_KEY] = { scope: "all", category: "all", brand: "all", studio: "all" };
    }
    if (Object.keys(defaults).length) chrome.storage.local.set(defaults);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "DP_RANDOM_SITE_READY") {
    startAutomaticScan(message.url).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "DP_RANDOM_START_AUTOSCAN") {
    startAutomaticScan(message.url, true).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "DP_RANDOM_PLAYER_ACTIVE") {
    localGet(AUTO_SCAN_KEY).then(async (stored) => {
      const scan = stored[AUTO_SCAN_KEY];
      if (scan?.active && scan.tabId !== sender.tab?.id) {
        await abortAutomaticScan(scan, "Wiedergabe hat Vorrang");
        sendResponse({ ok: true, stopped: true });
        return;
      }
      sendResponse({ ok: true, stopped: false });
    }).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "DP_RANDOM_AUTOSCAN_CHECK") {
    localGet(AUTO_SCAN_KEY).then((stored) => {
      const scan = stored[AUTO_SCAN_KEY];
      sendResponse(scan?.active && scan.tabId === sender.tab?.id ? { ok: true, scan } : { ok: false });
    });
    return true;
  }
  if (message?.type === "DP_RANDOM_AUTOSCAN_DONE") {
    advanceAutomaticScan(sender.tab?.id, message.result)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return undefined;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  localGet(AUTO_SCAN_KEY).then((stored) => {
    const scan = stored[AUTO_SCAN_KEY];
    if (scan?.active && scan.tabId === tabId) {
      localSet({ [AUTO_SCAN_KEY]: { ...scan, active: false, cancelledAt: Date.now() } });
      sessionRemove(AUTO_SCAN_SESSION_KEY);
    }
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return;
  localGet(AUTO_SCAN_KEY).then((stored) => {
    const scan = stored[AUTO_SCAN_KEY];
    if (!scan?.active || scan.tabId !== tabId) return;
    const unsafe = !safeSiteBase(changeInfo.url);
    if (unsafe) abortAutomaticScan(scan, "Disney+ ist nicht sicher angemeldet");
  });
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "random-series") return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (!activeTab?.id) return;
    chrome.tabs.sendMessage(activeTab.id, {
      type: "DP_RANDOM_ACTION",
      action: "random-series"
    }, () => void chrome.runtime.lastError);
  });
});
