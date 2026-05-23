'use strict';

module.exports = {
  async getSalesReport(user, query) {
    return {
      user,
      query,
      data: []
    };
  },

  async getDeliveryReport(user, query) {
    return {
      user,
      query,
      data: []
    };
  }
};
