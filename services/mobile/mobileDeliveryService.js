'use strict';

module.exports = {
  async getDashboard(user) {
    return {
      user,
      tongDonCanGiao: 0,
      tongTienCanThu: 0,
      tongCongNo: 0
    };
  },

  async getTodayOrders(user) {
    return [];
  },

  async getDebts(user) {
    return [];
  },

  async confirmDelivery(user, body) {
    return {
      user,
      confirm: body
    };
  },

  async collectDebt(user, body) {
    return {
      user,
      collect: body
    };
  }
};
