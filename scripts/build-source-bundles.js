'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { minify } = require('terser');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, 'config', 'source-bundles.json');
const CHECK_ONLY = process.argv.includes('--check');
const REFRESH_HASHES = process.argv.includes('--refresh-hashes');
const TARGET_ARG = process.argv.find((arg) => arg.startsWith('--target='));
const ONLY_TARGET = TARGET_ARG ? TARGET_ARG.slice('--target='.length).trim() : '';

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalPaths(entry) {
  const canonicalSource = String(entry.canonicalSource || '').trim();
  const parts = Array.isArray(entry.parts) ? entry.parts : [];
  if (canonicalSource && parts.length) {
    throw new Error(`${entry.target}: use canonicalSource or parts, never both`);
  }
  if (canonicalSource) return [canonicalSource];
  if (parts.length) return parts;
  throw new Error(`${entry.target}: no canonical source configured`);
}

function readCanonicalFiles(entry) {
  return canonicalPaths(entry).map((relativePath) => ({
    relativePath,
    content: fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
  }));
}

function generatedBanner(entry) {
  if (entry.canonicalSource) {
    return [
      '/* GENERATED FILE - DO NOT EDIT.',
      ` * Canonical source: ${entry.canonicalSource}`,
      ' * Build: npm run build:source-bundles',
      ' */',
      ''
    ].join('\n');
  }
  return `/* GENERATED FILE — edit ${entry.parts.join(', ')} and run npm run build:source-bundles. */\n`;
}

function sourceMapTarget(entry) {
  return entry.sourceMapTarget || `${entry.target}.map`;
}

function stripSourceMapComment(code) {
  return String(code || '').replace(/\n?\/\/# sourceMappingURL=[^\r\n]+\s*$/, '');
}

function executableSha256(code) {
  return sha256(`${stripSourceMapComment(code)}\n`);
}

async function minifyCode(code, entry, mode, sourceFiles) {
  const common = {
    format: {
      comments: false,
      max_line_len: 180,
      semicolons: true
    }
  };

  let input = code;
  let sourceMap;
  if (entry.sourceMap) {
    if (sourceFiles.length !== 1) {
      throw new Error(`${entry.target}: sourceMap requires exactly one canonical source file`);
    }
    const mapTarget = sourceMapTarget(entry);
    input = { [path.basename(sourceFiles[0])]: code };
    sourceMap = {
      filename: path.basename(entry.target),
      url: path.basename(mapTarget),
      includeSources: true
    };
  }

  let options;
  if (mode === 'commonjs') {
    options = {
      ...common,
      compress: { passes: 2 },
      mangle: { toplevel: true }
    };
  } else if (mode === 'module') {
    options = {
      ...common,
      module: true,
      compress: { passes: 2 },
      mangle: { toplevel: true }
    };
  } else if (mode === 'classic-single') {
    options = {
      ...common,
      compress: { passes: 2 },
      mangle: false
    };
  } else if (mode === 'classic-chunk') {
    options = {
      ...common,
      compress: false,
      mangle: false
    };
  } else {
    throw new Error(`Unsupported minify mode: ${mode}`);
  }

  const result = await minify(input, { ...options, ...(sourceMap ? { sourceMap } : {}) });
  return { code: result.code, map: result.map || '' };
}

function relativeCssImport(target, part) {
  const from = path.dirname(path.join(ROOT, target));
  const to = path.join(ROOT, part);
  let relative = path.relative(from, to).replace(/\\/g, '/');
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return relative;
}

async function renderEntry(entry) {
  const sourceFiles = canonicalPaths(entry);
  const sources = readCanonicalFiles(entry);
  const source = sources.map((item) => item.content).join('');
  const currentHash = sha256(source);
  if (!REFRESH_HASHES && entry.sourceSha256 && currentHash !== entry.sourceSha256) {
    throw new Error(`${entry.target}: canonical source hash changed. Run npm run source-bundles:refresh after reviewing behavior changes.`);
  }

  if (entry.mode === 'css-imports') {
    if (entry.sourceMap) throw new Error(`${entry.target}: sourceMap is not supported for css-imports`);
    const body = [
      '/* GENERATED MANIFEST — edit imported source parts, not this file. */',
      ...sourceFiles.map((part) => `@import url("${relativeCssImport(entry.target, part)}");`),
      ''
    ].join('\n');
    return [{ target: entry.target, content: body }];
  }

  if (entry.mode === 'classic-chunks') {
    if (entry.sourceMap) throw new Error(`${entry.target}: sourceMap is not supported for classic-chunks`);
    if (!Array.isArray(entry.runtimeFiles) || entry.runtimeFiles.length !== sources.length) {
      throw new Error(`${entry.target}: runtimeFiles must match canonical part count`);
    }
    const outputs = [];
    for (let index = 0; index < sources.length; index += 1) {
      const runtimeTarget = entry.runtimeFiles[index];
      const result = await minifyCode(sources[index].content, entry, 'classic-chunk', [sources[index].relativePath]);
      outputs.push({
        target: runtimeTarget,
        content: `${generatedBanner(entry)}${result.code}\n`
      });
    }
    return outputs;
  }

  const result = await minifyCode(source, entry, entry.mode, sourceFiles);
  const currentExecutableHash = executableSha256(result.code);
  if (!REFRESH_HASHES && entry.executableSha256 && currentExecutableHash !== entry.executableSha256) {
    throw new Error(`${entry.target}: executable output hash changed. Review behavior and refresh hashes explicitly.`);
  }
  if (REFRESH_HASHES && Object.prototype.hasOwnProperty.call(entry, 'executableSha256')) {
    entry.executableSha256 = currentExecutableHash;
  }

  const outputs = [{ target: entry.target, content: `${generatedBanner(entry)}${result.code}\n` }];
  if (entry.sourceMap) {
    outputs.push({ target: sourceMapTarget(entry), content: `${result.map}\n` });
  }
  return outputs;
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
  const allEntries = config.bundles || [];
  const entries = ONLY_TARGET ? allEntries.filter((entry) => entry.target === ONLY_TARGET) : allEntries;
  if (ONLY_TARGET && entries.length !== 1) {
    throw new Error(`Unknown source bundle target: ${ONLY_TARGET}`);
  }

  const failures = [];
  for (const entry of entries) {
    const source = readCanonicalFiles(entry).map((item) => item.content).join('');
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
  console.log(`[source-bundles] ${CHECK_ONLY ? 'OK' : 'BUILT'} ${entries.length} bundle${entries.length === 1 ? '' : 's'}`);
}

main().catch((error) => {
  console.error('[source-bundles] ERROR', error && error.stack ? error.stack : error);
  process.exit(1);
});
