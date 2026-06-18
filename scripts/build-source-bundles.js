'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { minify } = require('terser');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, 'config', 'source-bundles.json');
const CHECK_ONLY = process.argv.includes('--check');
const REFRESH_HASHES = process.argv.includes('--refresh-hashes');

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readParts(entry) {
  return entry.parts.map((relativePath) => ({
    relativePath,
    content: fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
  }));
}

function generatedBanner(entry) {
  return `/* GENERATED FILE — edit ${entry.parts.join(', ')} and run npm run build:source-bundles. */\n`;
}

async function minifyCode(code, entry, mode) {
  const common = {
    format: {
      comments: false,
      max_line_len: 180,
      semicolons: true
    }
  };

  if (mode === 'commonjs') {
    return (await minify(code, {
      ...common,
      compress: { passes: 2 },
      mangle: { toplevel: true }
    })).code;
  }

  if (mode === 'module') {
    return (await minify(code, {
      ...common,
      module: true,
      compress: { passes: 2 },
      mangle: { toplevel: true }
    })).code;
  }

  if (mode === 'classic-single') {
    return (await minify(code, {
      ...common,
      compress: { passes: 2 },
      mangle: false
    })).code;
  }

  if (mode === 'classic-chunk') {
    return (await minify(code, {
      ...common,
      compress: false,
      mangle: false
    })).code;
  }

  throw new Error(`Unsupported minify mode: ${mode}`);
}

function relativeCssImport(target, part) {
  const from = path.dirname(path.join(ROOT, target));
  const to = path.join(ROOT, part);
  let relative = path.relative(from, to).replace(/\\/g, '/');
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return relative;
}

async function renderEntry(entry) {
  const parts = readParts(entry);
  const source = parts.map((part) => part.content).join('');
  const currentHash = sha256(source);
  if (!REFRESH_HASHES && entry.sourceSha256 && currentHash !== entry.sourceSha256) {
    throw new Error(`${entry.target}: canonical source hash changed. Run npm run source-bundles:refresh after reviewing behavior changes.`);
  }

  if (entry.mode === 'css-imports') {
    const body = [
      '/* GENERATED MANIFEST — edit imported source parts, not this file. */',
      ...entry.parts.map((part) => `@import url("${relativeCssImport(entry.target, part)}");`),
      ''
    ].join('\n');
    return [{ target: entry.target, content: body }];
  }

  if (entry.mode === 'classic-chunks') {
    if (!Array.isArray(entry.runtimeFiles) || entry.runtimeFiles.length !== parts.length) {
      throw new Error(`${entry.target}: runtimeFiles must match canonical part count`);
    }
    const outputs = [];
    for (let index = 0; index < parts.length; index += 1) {
      const runtimeTarget = entry.runtimeFiles[index];
      const code = await minifyCode(parts[index].content, entry, 'classic-chunk');
      outputs.push({
        target: runtimeTarget,
        content: `${generatedBanner(entry)}${code}\n`
      });
    }
    return outputs;
  }

  const code = await minifyCode(source, entry, entry.mode);
  return [{ target: entry.target, content: `${generatedBanner(entry)}${code}\n` }];
}

function writeOrCheck(output, failures) {
  const absolute = path.join(ROOT, output.target);
  if (CHECK_ONLY) {
    if (!fs.existsSync(absolute)) {
      failures.push(`${output.target}: generated file missing`);
      return;
    }
    const actual = fs.readFileSync(absolute, 'utf8');
    if (actual !== output.content) failures.push(`${output.target}: generated file is stale`);
    return;
  }
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, output.content);
}

async function main() {
  const config = readConfig();
  const failures = [];
  for (const entry of config.bundles || []) {
    const source = readParts(entry).map((part) => part.content).join('');
    if (REFRESH_HASHES) entry.sourceSha256 = sha256(source);
    const outputs = await renderEntry(entry);
    outputs.forEach((output) => writeOrCheck(output, failures));
  }
  if (REFRESH_HASHES && !CHECK_ONLY) {
    fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`);
  }
  if (failures.length) {
    console.error('[source-bundles] FAILED');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }
  console.log(`[source-bundles] ${CHECK_ONLY ? 'OK' : 'BUILT'} ${(config.bundles || []).length} bundles`);
}

main().catch((error) => {
  console.error('[source-bundles] ERROR', error && error.stack ? error.stack : error);
  process.exit(1);
});
