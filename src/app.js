require('dotenv').config();

const { app, startServer } = require('./legacy/legacyApp');

module.exports = { app, startServer };
