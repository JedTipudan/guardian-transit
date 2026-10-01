import http from 'http';
import config from './config/env';
import { createApp } from './app';
import { createSocketServer } from './lib/socket';
import { prisma } from './lib/prisma';

async function main(): Promise<void> {
  const app = createApp();
  const server = http.createServer(app);
  createSocketServer(server);

  server.listen(config.port, () => {
    console.log(`\n  Guardian Transit API`);
    console.log(`  → http://localhost:${config.port}`);
    console.log(`  → env: ${config.nodeEnv} | sms: ${config.sms.provider} | maps: ${config.map.provider}\n`);
  });

  const shutdown = (signal: string) => {
    console.log(`\n${signal} received, shutting down...`);
    server.close(() => {
      prisma
        .$disconnect()
        .catch(() => undefined)
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
  });
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
