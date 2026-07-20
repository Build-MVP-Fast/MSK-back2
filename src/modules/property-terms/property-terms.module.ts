import { Module } from '@nestjs/common';

import { PropertyTermsController } from './property-terms.controller';
import { PropertyTermsService } from './property-terms.service';

@Module({
  controllers: [PropertyTermsController],
  providers: [PropertyTermsService],
  exports: [PropertyTermsService],
})
export class PropertyTermsModule {}
