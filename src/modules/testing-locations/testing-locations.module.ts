import { Module } from '@nestjs/common';

import { TestingLocationsController } from './testing-locations.controller';
import { TestingLocationsService } from './testing-locations.service';

@Module({
  controllers: [TestingLocationsController],
  providers: [TestingLocationsService],
})
export class TestingLocationsModule {}
