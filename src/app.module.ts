import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ChaptersModule } from './modules/chapters/chapters.module.js';
import { QuestionsModule } from './modules/questions/questions.module.js';
import { TagsModule } from './modules/tags/tags.module.js';
import { TestsModule } from './modules/tests/tests.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';

@Module({
  imports: [
    // Global environment configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),

    // Upload & API rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 120,
      },
    ]),

    // Core business domain modules
    ChaptersModule,
    QuestionsModule,
    TagsModule,
    TestsModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
