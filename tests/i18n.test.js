"use strict";

const assert = require("node:assert/strict");

const stored = {};
global.chrome = {
  storage: {
    local: {
      get(key, callback) { callback({ [key]: stored[key] }); },
      set(values, callback) { Object.assign(stored, values); callback?.(); }
    },
    onChanged: { addListener() {} }
  }
};

require("../i18n.js");

(async () => {
  const i18n = global.DisneyRandomI18n;
  await i18n.ready;

  assert.equal(i18n.language, "en");
  assert.equal(i18n.t("Zufällige Folge"), "Random episode");
  assert.equal(i18n.t("12 Titel · 8 Serien · 4 Filme"), "12 titles · 8 series · 4 movies");

  await i18n.setLanguage("de");
  assert.equal(i18n.language, "de");
  assert.equal(stored[i18n.STORAGE_KEY], "de");
  assert.equal(i18n.t("Random episode"), "Zufällige Folge");
  assert.equal(i18n.t("Zufällige Folge"), "Zufällige Folge");

  delete global.DisneyRandomI18n;
  delete require.cache[require.resolve("../i18n.js")];
  require("../i18n.js");
  const reloadedI18n = global.DisneyRandomI18n;
  await reloadedI18n.ready;
  assert.equal(reloadedI18n.language, "de");

  await reloadedI18n.setLanguage("xx");
  assert.equal(reloadedI18n.language, "en");
  assert.equal(stored[reloadedI18n.STORAGE_KEY], "en");

  console.log("i18n: English default, German switch, and persistence verified");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
