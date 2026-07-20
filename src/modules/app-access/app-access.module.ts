import { Module } from "@nestjs/common";

import { AppAccessController } from "./app-access.controller";
import { AppAccessService } from "./app-access.service";

@Module({
  controllers: [AppAccessController],
  providers: [AppAccessService],
  exports: [AppAccessService],
})
export class AppAccessModule {}
