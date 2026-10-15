import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend Expo client (web, emulator, and LAN)
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global validation pipe with class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // OpenAPI / Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('MCQForge API')
    .setDescription('Single-User Personal MCQ Testing Backend for NCERT Biology')
    .setVersion('1.0.0')
    .addTag('questions', 'Ingestion (file & paste), retrieval, and batch operations')
    .addTag('chapters', 'Seeded reference chapters for Class 11 and 12')
    .addTag('tests', 'Test execution, grading, and history')
    .addTag('analytics', 'Dashboard stats, streak, SRS spaced repetition')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  await app.listen(port, '0.0.0.0');

  console.log(`[MCQForge] Server running on http://localhost:${port}`);
  console.log(`[MCQForge] Listening on all network interfaces (0.0.0.0:${port})`);
  console.log(`[MCQForge] Swagger docs available at http://localhost:${port}/api/docs`);
}

bootstrap();
