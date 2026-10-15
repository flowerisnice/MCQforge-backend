import { Module } from '@nestjs/common';
import { QuestionsController } from './questions.controller.js';
import { QuestionsService } from './questions.service.js';
import { FirebaseAdminService } from '../../config/firebase-admin.service.js';

@Module({
  controllers: [QuestionsController],
  providers: [QuestionsService, FirebaseAdminService],
  exports: [QuestionsService],
})
export class QuestionsModule {}
