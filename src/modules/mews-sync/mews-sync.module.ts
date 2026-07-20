import { Module } from "@nestjs/common";

import { MewsSyncController } from "./mews-sync.controller";
import { MewsSyncService } from "./mews-sync.service";

@Module({
  controllers: [MewsSyncController],
  providers: [MewsSyncService],
  exports: [MewsSyncService],
})
export class MewsSyncModule {}
