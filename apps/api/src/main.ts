import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { mkdir } from 'node:fs/promises';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import type { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<AppConfig, true>);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: config.get('corsOrigins', { infer: true }),
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  // Receipts land here; failing at boot beats failing at the first upload.
  await mkdir(config.get('uploadDir', { infer: true }), { recursive: true });

  const port = config.get('port', { infer: true });
  await app.listen(port);

  Logger.log(`Romano API listening on http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
