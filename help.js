"use strict";

const CATALOG_KEY = "dpRandom.catalog.v1";
const I18n = globalThis.DisneyRandomI18n;

(async () => {
  await I18n.ready;
  chrome.storage.local.get(CATALOG_KEY, (result) => {
    const catalog = Array.isArray(result[CATALOG_KEY]) ? result[CATALOG_KEY] : [];
    const seriesCount = catalog.filter((item) => item?.type === "series").length;
    const movieCount = catalog.filter((item) => item?.type === "movie").length;
    document.getElementById("series-count").textContent = String(seriesCount);
    document.getElementById("movie-count").textContent = String(movieCount);
    document.getElementById("title-count").textContent = String(catalog.length);
  });
})();

document.getElementById("open-disney").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://www.disneyplus.com/" });
});

document.getElementById("open-catalog").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("catalog.html") });
});
