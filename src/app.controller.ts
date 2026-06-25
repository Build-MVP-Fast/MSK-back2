import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Public } from './common/decorators/public.decorator';

@ApiTags('health')
@Controller()
export class AppController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /** Public deploy-info endpoint. Render injects RENDER_GIT_COMMIT at
   *  runtime; we surface it here so you can curl /api/v1/version to
   *  see exactly which commit the live backend is running, instead of
   *  guessing whether the latest push has deployed. */
  @Public()
  @Get('version')
  version() {
    return {
      commit: process.env.RENDER_GIT_COMMIT ?? 'unknown',
      branch: process.env.RENDER_GIT_BRANCH ?? 'unknown',
      service: process.env.RENDER_SERVICE_NAME ?? 'unknown',
      bootedAt: new Date().toISOString(),
    };
  }
}
