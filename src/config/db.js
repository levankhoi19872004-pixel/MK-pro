const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('❌ Thiếu MONGO_URI trong environment variables');
  }

  try {
    mongoose.set('strictQuery', true);
    mongoose.set('debug', process.env.MONGOOSE_DEBUG === 'true' || process.env.NODE_ENV === 'development');

    // Index được quản lý tập trung bởi mongoIndexService. Mặc định tắt autoIndex
    // để Mongoose không tự tạo thêm username_1/roleCode_1/... chồng lên policy chuẩn.
    const autoIndex = process.env.MONGOOSE_AUTO_INDEX === 'true';
    mongoose.set('autoIndex', autoIndex);

    await mongoose.connect(mongoUri, {
      autoIndex,
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
    throw error;
  }
};

module.exports = connectDB;
