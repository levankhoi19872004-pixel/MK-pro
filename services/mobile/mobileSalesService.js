'use strict';

module.exports = {
  async getDashboard(user) {
    return {
      user,
      tongDonHomNay: 0,
      doanhSoHomNay: 0,
      congNo: 0
    };
  },

  async getProducts(user) {
    return [];
  },

  async getCustomers(user) {
    return [];
  },

  async createOrder(user, body) {
    return {
      user,
      order: body
    };
  },

  async getTodayOrders(user) {
    return [];
  },

  async getDebts(user) {
    return [];
  }
};
