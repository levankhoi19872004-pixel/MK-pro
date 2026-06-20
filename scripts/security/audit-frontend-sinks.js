'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const outputPath = path.resolve(ROOT, outputArg ? outputArg.slice('--output='.length) : 'CSP_XSS_SINK_INVENTORY.json');
const check = process.argv.includes('--check');
const sourceBundleConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/source-bundles.json'), 'utf8'));
const generatedTargets = new Set();
for (const bundle of sourceBundleConfig.bundles || []) {
  if (bundle.target) generatedTargets.add(bundle.target.replace(/\\/g, '/'));
  for (const runtime of bundle.runtimeFiles || []) generatedTargets.add(runtime.replace(/\\/g, '/'));
}

const roots = ['public', 'templates', 'services', 'src/routes'];
const extensions = new Set(['.js', '.jsfrag', '.html']);
const files = [];
function walk(relative) {
  const absolute = path.join(ROOT, relative);
  if (!fs.existsSync(absolute)) return;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) walk(next);
    else if (extensions.has(path.extname(entry.name))) files.push(next.replace(/\\/g, '/'));
  }
}
roots.forEach(walk);

function lineNumber(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function sample(source, offset, length = 420) {
  return source.slice(offset, offset + length).replace(/\s+/g, ' ').trim().slice(0, 360);
}

function classifyHtmlSink(snippet) {
  if (/\.innerHTML\s*=\s*['"]\s*['"]/.test(snippet) || /\.innerHTML\s*=\s*`\s*`/.test(snippet)) {
    return ['static-trusted-template', 'clear-only assignment'];
  }
  if (/\.innerHTML\s*=\s*['"`][^$`]*['"`]/.test(snippet) && !/\$\{/.test(snippet)) {
    return ['static-trusted-template', 'literal markup without interpolation'];
  }
  if (/(escapeHtml|escapeSalesHtml|escapeImportHtml|escapeImportOrderHtml|escapeProductHtml|masterOrderEscapeHtml|apiMonitorSafeText|reportEscape|\besc\(|\btext\(|sanitize)/.test(snippet)) {
    return ['dynamic-escaped', 'dynamic values pass an explicit encoding helper'];
  }
  if (/(err|error)\.message/.test(snippet)) {
    return ['high-risk', 'error text reaches an HTML parser without visible encoding'];
  }
  if (/appendTrustedHtml/.test(snippet) || /template\.innerHTML/.test(snippet)) {
    return ['controlled-template-exception', 'centralized template parser; callers must provide encoded markup'];
  }
  if (/\$\{|\.map\(|\.join\(/.test(snippet)) {
    return ['dynamic-unverified', 'dynamic template requires manual data-flow verification'];
  }
  return ['unknown', 'insufficient static evidence'];
}

const findings = [];
for (const file of files.sort()) {
  const absolute = path.join(ROOT, file);
  const source = fs.readFileSync(absolute, 'utf8');
  const generated = generatedTargets.has(file);
  const patterns = [
    { sink: 'innerHTML', regex: /\.innerHTML\s*=/g },
    { sink: 'insertAdjacentHTML', regex: /insertAdjacentHTML\s*\(/g },
    { sink: 'document.write', regex: /document\.write\s*\(/g },
    { sink: 'inline-event-handler', regex: /\son(?:click|change|input|submit|error|load|focus|blur|keydown|keyup)\s*=\s*["']/gi },
    { sink: 'inline-script', regex: /<script(?![^>]*\bsrc=)[^>]*>/gi }
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.regex.exec(source))) {
      const snippet = sample(source, match.index);
      let classification = 'high-risk';
      let reason = `${pattern.sink} is executable markup`;
      if (pattern.sink === 'inline-script' && path.extname(file) !== '.html') {
        if (/script\(\?:|<script\(\?!/.test(snippet)) continue;
        if (/script src=/.test(snippet)) {
          classification = 'static-trusted-template';
          reason = 'external script tag with an explicit src';
        }
      }
      if (pattern.sink === 'innerHTML' || pattern.sink === 'insertAdjacentHTML') {
        [classification, reason] = classifyHtmlSink(snippet);
      } else if (pattern.sink === 'document.write') {
        classification = 'dynamic-unverified';
        reason = 'document.write parses a complete HTML document; source must be trusted and encoded';
      }
      findings.push({
        file,
        line: lineNumber(source, match.index),
        sink: pattern.sink,
        classification,
        reason,
        generated,
        sample: snippet
      });
    }
  }
}

const counts = findings.reduce((acc, finding) => {
  acc.total += 1;
  acc.bySink[finding.sink] = (acc.bySink[finding.sink] || 0) + 1;
  acc.byClassification[finding.classification] = (acc.byClassification[finding.classification] || 0) + 1;
  if (finding.generated) acc.generated += 1;
  return acc;
}, { total: 0, generated: 0, bySink: {}, byClassification: {} });

const blocking = findings.filter((finding) =>
  finding.classification === 'high-risk' && !finding.generated
);
const result = {
  generatedAt: new Date().toISOString(),
  roots,
  counts,
  blockingCount: blocking.length,
  findings
};
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`[frontend-sinks] ${findings.length} findings; blocking=${blocking.length}; output=${path.relative(ROOT, outputPath)}`);
if (check && blocking.length) {
  blocking.slice(0, 20).forEach((finding) => console.error(`- ${finding.file}:${finding.line} ${finding.sink} ${finding.reason}`));
  process.exitCode = 1;
}
