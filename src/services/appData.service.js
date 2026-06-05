const AppDataRepository = require('../repositories/appData.repository');

function createAppDataService({ collectionKeys, normalizeData, ensureDefaultStaffAccounts }) {
  const repository = new AppDataRepository(collectionKeys);

  async function loadPrimaryData() {
    const mongoData = await repository.loadAll();
    return normalizeData(ensureDefaultStaffAccounts(mongoData));
  }

  async function persistPrimaryData(data) {
    const normalized = normalizeData(ensureDefaultStaffAccounts(data));

    // V45 canonical return flow:
    // returnOrders is an operational document collection. It must never be
    // replaced by a broad primary-data/mobile snapshot, otherwise an older
    // snapshot can wipe or hide return orders that were just upserted.
    // Only returnOrderRepository.upsert() is allowed to write returnOrders.
    delete normalized.returnOrders;

    await repository.replaceAll(normalized);
    return normalized;
  }

  async function getCounts() {
    return repository.counts();
  }

  return { loadPrimaryData, persistPrimaryData, getCounts };
}

module.exports = { createAppDataService };
