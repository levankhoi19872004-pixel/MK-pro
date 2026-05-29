'use strict';

const mongoose = require('mongoose');
const AppDataRepository = require('../repositories/appData.repository');
const { APP_COLLECTION_KEYS } = require('../constants/collectionKeys');

const repository = new AppDataRepository(APP_COLLECTION_KEYS);

async function getDataSnapshot() {
  return repository.loadAll();
}

async function persistDataSnapshot(data = {}) {
  const normalized = {};
  APP_COLLECTION_KEYS.forEach((key) => {
    normalized[key] = Array.isArray(data[key]) ? data[key] : [];
  });
  await repository.replaceAll(normalized);
  return normalized;
}

async function getDataSourceStatus() {
  const mongoCounts = await repository.counts();
  return {
    primaryDataSource: 'mongodb',
    jsonUsage: 'backup-only',
    mongoCounts,
    mongoReadyState: mongoose.connection.readyState
  };
}

function health() {
  return {
    ok: true,
    message: 'KHO Minh Khai Pro V45 server is running',
    time: new Date().toISOString()
  };
}

function dbHealth() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return {
    ok: mongoose.connection.readyState === 1,
    state: states[mongoose.connection.readyState] || 'unknown',
    readyState: mongoose.connection.readyState
  };
}

module.exports = {
  health,
  dbHealth,
  getDataSnapshot,
  persistDataSnapshot,
  getDataSourceStatus
};
