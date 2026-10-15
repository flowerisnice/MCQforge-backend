import { Module } from '@nestjs/common';
import { ChaptersController } from './chapters.controller.js';
import { ChaptersService } from './chapters.service.js';
import { FirebaseAdminService } from '../../config/firebase-admin.service.js';

@Module({
  controllers: [ChaptersController],
  providers: [ChaptersService, FirebaseAdminService],
  exports: [ChaptersService],
})
export class ChaptersModule {}
