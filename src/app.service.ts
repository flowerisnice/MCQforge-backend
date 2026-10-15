import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth(): { status: string; app: string; version: string } {
    return {
      status: 'ok',
      app: 'MCQForge Backend',
      version: '1.0.0',
    };
  }
}
