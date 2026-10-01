import path from 'path';
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import config from './config/env';
import { errorHandler, notFoundHandler } from './lib/errors';
import { globalLimiter } from './middleware/rateLimit';
import { optionalAuth } from './middleware/auth';

import authRoutes from './routes/auth';
import accountRoutes from './routes/account';
import metaRoutes from './routes/meta';
import guardianRoutes from './routes/guardians';
import studentRoutes from './routes/students';
import rideRoutes from './routes/rides';
import driverRoutes from './routes/driver';
import notificationRoutes from './routes/notifications';
import emergencyRoutes from './routes/emergency';
import safetyRoutes from './routes/safety';
import rewardRoutes from './routes/rewards';
import adminRoutes from './routes/admin';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || config.corsOrigins.includes(origin) || config.corsOrigins.includes('*')) {
          callback(null, true);
          return;
        }
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(globalLimiter);
  app.use(optionalAuth);

  app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

  app.use('/api/auth', authRoutes);
  app.use('/api/account', accountRoutes);
  app.use('/api', metaRoutes);
  app.use('/api/guardians', guardianRoutes);
  app.use('/api/students', studentRoutes);
  app.use('/api/rides', rideRoutes);
  app.use('/api/driver', driverRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/emergency', emergencyRoutes);
  app.use('/api/safety', safetyRoutes);
  app.use('/api/rewards', rewardRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
