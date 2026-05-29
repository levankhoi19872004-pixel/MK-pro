const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('❌ Thiếu MONGO_URI trong environment variables');
  }

  try {
    mongoose.set('strictQuery', true);

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000
    });

    console.log('✅ MongoDB connected');
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
