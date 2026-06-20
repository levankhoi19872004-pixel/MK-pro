const mongoose = require('mongoose');
const { getRuntimeConfig } = require('./app.config');
const { logger } = require('../observability/logger');

const connectDB = async () => {
  const { app, database } = getRuntimeConfig();
  const mongoUri = database.mongoUri;

  if (!mongoUri) {
    throw new Error('❌ Thiếu MONGO_URI trong environment variables');
  }

  try {
    mongoose.set('strictQuery', true);
    mongoose.set('debug', database.debug || app.nodeEnv === 'development');

    // Index được quản lý tập trung bởi mongoIndexService. Mặc định tắt autoIndex
    // để Mongoose không tự tạo thêm username_1/roleCode_1/... chồng lên policy chuẩn.
    const autoIndex = database.autoIndex;
    mongoose.set('autoIndex', autoIndex);

    await mongoose.connect(mongoUri, {
      autoIndex,
      maxPoolSize: database.maxPoolSize,
      minPoolSize: database.minPoolSize,
      serverSelectionTimeoutMS: database.serverSelectionTimeoutMs,
      socketTimeoutMS: database.socketTimeoutMs,
      family: 4,
      retryWrites: true,
      w: database.writeConcern
    });

    logger.info({ database: mongoose.connection.name }, 'MongoDB connected');
    return true;
  } catch (error) {
    logger.error({ err: error }, 'MongoDB connection error');
    throw error;
  }
};

module.exports = connectDB;
