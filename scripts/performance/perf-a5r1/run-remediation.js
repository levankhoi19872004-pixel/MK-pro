'use strict';
const { spawnSync } = require('child_process');
const result=spawnSync(process.execPath,['--test','test/performance/perf-a5r1/perf-a5r1-remediation.test.js'],{stdio:'inherit'});
process.exit(result.status ?? 1);
