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
  //
  // Allowlist matching also tolerates a missing/extra `www.` so a single
  // entry (e.g. `https://mskresidence.com`) covers both the apex and the
  // www subdomain — this avoids the "I added it but the www form still
  // 500s" trap we hit on prod.
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  const rawOrigins = config.get<string>('CORS_ORIGINS', '').split(',').filter(Boolean);
  const allowedOrigins = new Set<string>();
  for (const o of rawOrigins) {
    const trimmed = o.trim();
    if (!trimmed) continue;
    allowedOrigins.add(trimmed);
    // Add the "other" www-variant for each entry so apex ↔ www are
    // interchangeable.
    try {
      const url = new URL(trimmed);
      if (url.hostname.startsWith('www.')) {
        url.hostname = url.hostname.slice(4);
      } else {
        url.hostname = `www.${url.hostname}`;
      }
      allowedOrigins.add(url.origin);
    } catch {
      // Malformed entry — keep the literal form, drop the variant.
    }
  }

  const localHostRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  const privateLanRegex =
    /^https?:\/\/((192\.168\.\d+\.\d+)|(10\.\d+\.\d+\.\d+)|(172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+))(:\d+)?$/;
  app.enableCors({
    origin: (origin, cb) => {
      // Same-origin / curl / server-to-server (no Origin header).
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      if (!isProduction && (localHostRegex.test(origin) || privateLanRegex.test(origin))) {
        return cb(null, true);
      }
      // Returning `false` lets cors short-circuit with a clean refusal —
      // the response just omits Access-Control-Allow-Origin and the
      // browser blocks. Throwing an Error here would bubble into
      // AllExceptionsFilter as a 500, which is what the logs were showing
      // before this fix.
      return cb(null, false);
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
