'use strict';

const query = require('./masterOrderQuery.service');
const command = require('./masterOrderCommand.service');
const deliveryQuery = require('./deliveryTodayQuery.service');
const deliveryCommand = require('./deliveryOrderCommand.service');

module.exports = { ...query, ...command, ...deliveryQuery, ...deliveryCommand };
