const collectionRepository = require('./mongoCollection.repository');

class AppDataRepository {
  constructor(collectionKeys) {
    this.collectionKeys = collectionKeys;
  }

  async loadAll(options = {}) {
    const data = {};
    for (const key of this.collectionKeys) {
      data[key] = await collectionRepository.findAll(key, {}, options);
    }
    return data;
  }

  async replaceAll(data, options = {}) {
    const result = [];
    const source = data || {};
    for (const key of this.collectionKeys) {
      // Không replace collection nếu snapshot không chủ động mang key đó.
      // Điều này cho phép loại returnOrders khỏi snapshot mà không bị xóa sạch.
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      result.push(await collectionRepository.replaceAll(key, source[key] || [], options));
    }
    return result;
  }

  async counts(options = {}) {
    const result = {};
    for (const key of this.collectionKeys) {
      result[key] = await collectionRepository.count(key, {}, options);
    }
    return result;
  }
}

module.exports = AppDataRepository;
