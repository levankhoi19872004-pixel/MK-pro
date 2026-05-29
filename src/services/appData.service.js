const AppDataRepository = require('../repositories/appData.repository');

function createAppDataService({ collectionKeys, normalizeData, ensureDefaultStaffAccounts }) {
  const repository = new AppDataRepository(collectionKeys);

  async function loadPrimaryData() {
    const mongoData = await repository.loadAll();
    return normalizeData(ensureDefaultStaffAccounts(mongoData));
  }

  async function persistPrimaryData(data) {
    const normalized = normalizeData(ensureDefaultStaffAccounts(data));
    await repository.replaceAll(normalized);
    return normalized;
  }

  async function getCounts() {
    return repository.counts();
  }

  return { loadPrimaryData, persistPrimaryData, getCounts };
}

module.exports = { createAppDataService };
