import { Module } from '@nestjs/common';

import { PropertyContentController } from './property-content.controller';
import { PropertyContentService } from './property-content.service';

@Module({
  controllers: [PropertyContentController],
  providers: [PropertyContentService],
  exports: [PropertyContentService],
})
export class PropertyContentModule {}
