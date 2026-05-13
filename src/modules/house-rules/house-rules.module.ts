import { Module } from '@nestjs/common';

import { HouseRulesController } from './house-rules.controller';
import { HouseRulesService } from './house-rules.service';

@Module({
  controllers: [HouseRulesController],
  providers: [HouseRulesService],
})
export class HouseRulesModule {}
