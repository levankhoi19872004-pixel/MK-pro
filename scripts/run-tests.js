'use strict';

require('./cleanup-retired-files');

const { spawnSync } = require('child_process');

const env = { ...process.env, NODE_ENV: process.env.NODE_ENV || 'test' };
const result = spawnSync(process.execPath, ['--test'], {
  stdio: 'inherit',
  env
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
