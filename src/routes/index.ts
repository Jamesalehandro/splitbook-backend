import { Router } from 'express';

import { HealthController } from '../controllers/health.controller';

import authRoutes from './auth.routes';
import groupRoutes from './group.routes';
import userRoutes from './user.routes';

const router = Router();

router.get('/health', HealthController.health);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/groups', groupRoutes);

export default router;
