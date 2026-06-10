const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('❌ Thiếu MONGO_URI trong environment variables');
  }

  try {
    mongoose.set('strictQuery', true);
    mongoose.set('debug', process.env.MONGOOSE_DEBUG === 'true' || process.env.NODE_ENV === 'development');

    await mongoose.connect(mongoUri, {
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 50),
      minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 5),
      serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 5000),
      socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 45000),
      family: 4,
      retryWrites: true,
      w: process.env.MONGO_WRITE_CONCERN || 'majority'
    });

    console.log('✅ MongoDB connected');
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
