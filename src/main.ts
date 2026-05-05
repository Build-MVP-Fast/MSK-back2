import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 4000);

  // Security & utility middleware
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  // CORS — app, website, dashboard.
  // In non-production environments any localhost/127.0.0.1 origin is allowed
  // (regardless of port) so new local dev clients work without env edits.
  // In production, only the explicit CORS_ORIGINS allowlist is honored.
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  const origins = config.get<string>('CORS_ORIGINS', '').split(',').filter(Boolean);
  const localHostRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  app.enableCors({
    origin: (origin, cb) => {
      // Same-origin / curl / server-to-server (no Origin header).
      if (!origin) return cb(null, true);
      if (origins.includes(origin)) return cb(null, true);
      if (!isProduction && localHostRegex.test(origin)) return cb(null, true);
      return cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // API versioning
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'docs'],
  });

  // Swagger / OpenAPI
  const swaggerConfig = new DocumentBuilder()
    .setTitle('MSK Platform API')
    .setDescription('Unified backend API powering the mobile app, website, and admin dashboard.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`MSK backend listening on http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(`Docs available at http://localhost:${port}/docs`);
}

bootstrap();
