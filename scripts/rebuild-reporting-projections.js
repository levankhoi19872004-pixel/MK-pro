'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const ProjectionService = require('../src/services/analytics/ProjectionService');
const { DEFAULT_TENANT_ID } = require('../src/utils/tenant.util');

async function main() {
  await connectDB();
  const dateArg = process.argv.find((arg) => arg.startsWith('--date='));
  const date = dateArg ? dateArg.split('=')[1] : '';
  const result = await ProjectionService.rebuildDaily(date, {
    tenantId: process.env.PROJECTION_TENANT_ID || DEFAULT_TENANT_ID
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
});
