import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { describe, beforeEach, it, expect } from 'vitest';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return health status ok', () => {
      expect(appController.getHealth()).toEqual({
        status: 'ok',
        app: 'MCQForge Backend',
        version: '1.0.0',
      });
    });
  });
});
