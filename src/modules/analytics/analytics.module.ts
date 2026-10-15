import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';
import { FirebaseAdminService } from '../../config/firebase-admin.service.js';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, FirebaseAdminService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
