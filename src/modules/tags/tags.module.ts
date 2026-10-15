import { Module } from '@nestjs/common';
import { TagsController } from './tags.controller.js';
import { TagsService } from './tags.service.js';
import { FirebaseAdminService } from '../../config/firebase-admin.service.js';

@Module({
  controllers: [TagsController],
  providers: [TagsService, FirebaseAdminService],
  exports: [TagsService],
})
export class TagsModule {}
