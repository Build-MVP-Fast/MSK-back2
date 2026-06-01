import { Global, Module, OnApplicationBootstrap } from '@nestjs/common';

import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

// @Global so PermissionsGuard can inject the service from anywhere
// without each module re-importing it.
@Global()
@Module({
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule implements OnApplicationBootstrap {
  constructor(private readonly service: PermissionsService) {}

  // Seed the catalog + role defaults on every boot. Idempotent — already-
  // configured roles are left alone, only catalog labels are kept in
  // sync.
  async onApplicationBootstrap() {
    await this.service.seed();
  }
}
