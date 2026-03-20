const mongoose = require('mongoose');

function connectDatabase() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    return Promise.reject(new Error('MONGO_URI is not defined'));
  }
  const options = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  };
  return mongoose.connect(uri, options).then(() => {
    console.info('MongoDB connected');
  });
}

module.exports = connectDatabase;
