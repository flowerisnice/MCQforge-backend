import { Module } from '@nestjs/common';
import { TestsController } from './tests.controller.js';
import { TestsService } from './tests.service.js';
import { FirebaseAdminService } from '../../config/firebase-admin.service.js';

@Module({
  controllers: [TestsController],
  providers: [TestsService, FirebaseAdminService],
  exports: [TestsService],
})
export class TestsModule {}
