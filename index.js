require('dotenv').config();

const app = require('./app');
const cloudinary = require('cloudinary');

const PORT = Number(process.env.PORT) || 3099;
const NODE_ENV = process.env.NODE_ENV || 'development';

process.on('uncaughtException', (err) => {
  console.error('UncaughtException:', err.message);
  process.exit(1);
});

if (process.env.CLOUDINARY_NAME && process.env.CLOUDINARY_API_KEY) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

function startServer() {
  const server = app.listen(PORT, () => {
    console.info(`Server running on port ${PORT} (${NODE_ENV})`);
  });

  process.on('unhandledRejection', (err) => {
    console.error('UnhandledRejection:', err.message);
    server.close(() => process.exit(1));
  });

  const shutdown = (signal) => {
    console.info(`${signal} received. Shutting down gracefully.`);
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();
