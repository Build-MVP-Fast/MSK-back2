import { Module } from '@nestjs/common';
import { WizardsController } from './wizards.controller';
import { WizardsService } from './wizards.service';

@Module({
  controllers: [WizardsController],
  providers: [WizardsService],
  exports: [WizardsService],
})
export class WizardsModule {}
