'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_PATTERNS = Object.freeze({
  summaryAfterLimit: /\.limit\s*\([^)]*\)[\s\S]{0,1800}?\b(?:summary|total|count)\b[\s\S]{0,1000}?\.(?:reduce|filter)\s*\(/m,
  clientPostFilterBackendSummary: /\b(?:visible|filteredRows|rows|items)\s*=\s*(?:rows|items|state\.rows|[A-Za-z0-9_$.]+)\.filter\s*\([\s\S]{0,1400}?\bsummary\.(?:totalAmount|count|totalCount|submittedCount|confirmedCount|rejectedCount)/m,
  pageTotalAsGlobalTotal: /\blimit\b[\s\S]{0,1600}?\brows\.reduce\s*\([\s\S]{0,900}?(?:Tổng|total|KPI|summary|totalAmount)/m,
  exportScopeDrift: /\b(?:export|download)[A-Za-z0-9_$]*\s*\([^)]*\)[\s\S]{0,1800}?new URLSearchParams[\s\S]{0,1800}?\b(?:page|limit)\b/m,
  truncatedKpiWorkingSet: /\b(?:ledgerLimit|limit)\b[\s\S]{0,1200}?\b(?:groupLedgers|reduce)\s*\([\s\S]{0,1200}?\bsummary\b/m
});

const ALLOWLIST_MARKERS = [
  'SELECTION_SCOPE',
  'FACET_SCOPE',
  'GLOBAL_EXPLICIT_SCOPE',
  'boundedLedgerRead',
  'truncatedWorkingSet',
  'data-selection-scope',
  'autocomplete',
  'suggestion',
  'display-only'
];

function lineOf(text, index) {
  return text.slice(0, Math.max(0, index)).split(/\r?\n/).length;
}

function hasAllowlistMarker(text, index) {
  const start = Math.max(0, index - 1000);
  const end = Math.min(text.length, index + 1000);
  const nearby = text.slice(start, end);
  return ALLOWLIST_MARKERS.some((marker) => nearby.includes(marker));
}

function auditText(text, file = '<memory>') {
  const findings = [];
  for (const [id, pattern] of Object.entries(DEFAULT_PATTERNS)) {
    const match = pattern.exec(text);
    if (!match) continue;
    const allowed = hasAllowlistMarker(text, match.index);
    findings.push({
      id,
      file,
      line: lineOf(text, match.index),
      severity: allowed ? 'P2_REVIEW_ALLOWED_SCOPE' : 'P1_REVIEW_REQUIRED',
      allowed,
      evidence: match[0].slice(0, 240).replace(/\s+/g, ' ').trim()
    });
  }
  return findings;
}

function auditFiles(files = []) {
  return files.flatMap((file) => {
    const text = fs.readFileSync(file, 'utf8');
    return auditText(text, file);
  });
}

function collectCandidateFiles(rootDir) {
  const roots = ['src', 'public'];
  const exts = new Set(['.js', '.jsfrag']);
  const generatedTargets = new Set();
  const sourceBundleConfig = path.join(rootDir, 'config', 'source-bundles.json');
  if (fs.existsSync(sourceBundleConfig)) {
    try {
      const config = JSON.parse(fs.readFileSync(sourceBundleConfig, 'utf8'));
      for (const bundle of config.bundles || []) {
        if (bundle.target) generatedTargets.add(path.resolve(rootDir, bundle.target));
        for (const runtimeFile of bundle.runtimeFiles || []) generatedTargets.add(path.resolve(rootDir, runtimeFile));
      }
    } catch (error) {
      // Best-effort static audit: if config parsing fails, scan all files.
    }
  }
  const out = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (exts.has(path.extname(entry.name)) && !generatedTargets.has(path.resolve(full))) out.push(full);
    }
  }
  for (const name of roots) walk(path.join(rootDir, name));
  return out;
}

module.exports = {
  auditText,
  auditFiles,
  collectCandidateFiles,
  DEFAULT_PATTERNS,
  ALLOWLIST_MARKERS
};
