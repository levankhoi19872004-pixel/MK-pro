"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const entrySource = fs.readFileSync("public/mobile/js/delivery-mobile-view.source.js", "utf8");
const uiUtilsSource = fs.readFileSync("public/mobile/js/delivery-ui-utils.js", "utf8");
const ordersViewSource = fs.readFileSync("public/mobile/js/delivery-orders-view.js", "utf8");
const css = fs.readFileSync("public/mobile/mobile.source/mobile-04.css", "utf8");
const androidPaths = ["android", "app", "cordova", "capacitor.config.js", "capacitor.config.ts", "capacitor.config.json"];

function mapOnly(source) {
  return source
    .split(/\n/)
    .filter((line) => /map|maps|geo:|intent:|delivery-map|Google Maps|Bản đồ/i.test(line))
    .join("\n");
}

test("phase25 map buttons call external-open helper instead of direct anchors", () => {
  assert.match(ordersViewSource, /data-delivery-map/);
  assert.match(ordersViewSource, /data-map-address/);
  assert.match(ordersViewSource, /Bản đồ/);
  assert.doesNotMatch(mapOnly(ordersViewSource), /href="\s*https:\/\/(www\.)?google\.com\/maps/);
  assert.doesNotMatch(mapOnly(ordersViewSource), /target="_blank"/);
});

test("phase25 map click handler prevents default navigation and stops card selection", () => {
  assert.match(entrySource, /'\[data-delivery-map\]'/);
  assert.match(entrySource, /event\.preventDefault\(\)/);
  assert.match(entrySource, /event\.stopPropagation\(\)/);
  assert.match(entrySource, /openDeliveryMapExternal\(\{/);
});

test("phase25 map helper does not use same-webview location navigation", () => {
  const mapSource = mapOnly(uiUtilsSource);
  assert.match(uiUtilsSource, /function openDeliveryMapExternal/);
  assert.match(uiUtilsSource, /function showDeliveryMapFallback/);
  assert.match(uiUtilsSource, /window\.Android\.openExternalUrl/);
  assert.match(uiUtilsSource, /ReactNativeWebView\.postMessage/);
  assert.match(uiUtilsSource, /intent:\/\/maps\.google\.com\/maps/);
  assert.doesNotMatch(mapSource, /location\.href|window\.location|location\.assign|location\.replace/);
});

test("phase25 fallback lets delivery user copy address and close popup", () => {
  assert.match(uiUtilsSource, /deliveryMapFallback/);
  assert.match(uiUtilsSource, /Copy địa chỉ/);
  assert.match(uiUtilsSource, /Mở Google Maps/);
  assert.match(uiUtilsSource, /data-map-close/);
  assert.match(uiUtilsSource, /copyText\(urls\.address\)/);
  assert.match(css, /m-map-fallback-backdrop/);
});

test("phase25 documents Android WebView wrapper requirement when wrapper is absent", () => {
  const hasAndroidWrapper = androidPaths.some((p) => fs.existsSync(p));
  assert.equal(hasAndroidWrapper, false);
  const note = fs.readFileSync("APK_WEBVIEW_MAP_EXTERNAL_OPEN_NOTE.md", "utf8");
  assert.match(note, /geo:/);
  assert.match(note, /intent:/);
  assert.match(note, /maps\.google\.com/);
  assert.match(note, /shouldOverrideUrlLoading/);
});
