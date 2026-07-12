'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  collectArtifactFiles,
  validateArtifactEntries
} = require('./lib/release-artifact-policy');
const { listZipEntries, extractZip } = require('./lib/zip-artifact');

function parseArgs(argv = process.argv.slice(2)) {
  const args = { zip: '', directory: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--zip') args.zip = argv[++index] || '';
    else if (value === '--directory') args.directory = argv[++index] || '';
    else if (!args.zip && !args.directory) args.zip = value;
  }
  if (!args.zip && !args.directory) args.directory = '.';
  return args;
}

async function verifyArtifact(args = parseArgs()) {
  const target = args.zip || args.directory;
  const absolute = path.resolve(target);
  if (!fs.existsSync(absolute)) throw new Error(`Artifact not found: ${absolute}`);

  if (args.directory) {
    const entries = collectArtifactFiles(absolute);
    return {
      target: absolute,
      ...validateArtifactEntries(entries, { root: absolute, requireStructure: true })
    };
  }

  const entries = await listZipEntries(absolute, { checkCRC32: true });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkpro-source-artifact-'));
  try {
    await extractZip(absolute, tempDir, { checkCRC32: true });
    return {
      target: absolute,
      ...validateArtifactEntries(entries, { root: tempDir, requireStructure: true })
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  const result = await verifyArtifact();
  if (!result.ok) {
    console.error(`[artifact-clean] FAILED policy=${result.policyVersion}`);
    result.violations.forEach((item) => console.error(`- ${item}`));
    process.exit(1);
  }
  console.log(`[artifact-clean] OK ${result.checkedEntries} entries policy=${result.policyVersion} ${path.relative(process.cwd(), result.target) || result.target}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[artifact-clean] ERROR ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  verifyArtifact,
  listZipEntries,
  parseArgs
};
