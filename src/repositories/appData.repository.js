const collectionRepository = require('./mongoCollection.repository');

class AppDataRepository {
  constructor(collectionKeys) {
    this.collectionKeys = collectionKeys;
  }

  async loadAll() {
    const data = {};
    for (const key of this.collectionKeys) {
      data[key] = await collectionRepository.findAll(key);
    }
    return data;
  }

  async replaceAll(data) {
    const result = [];
    for (const key of this.collectionKeys) {
      result.push(await collectionRepository.replaceAll(key, data[key] || []));
    }
    return result;
  }

  async counts() {
    const result = {};
    for (const key of this.collectionKeys) {
      result[key] = await collectionRepository.count(key);
    }
    return result;
  }
}

module.exports = AppDataRepository;
