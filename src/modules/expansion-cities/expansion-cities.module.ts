import { Module } from '@nestjs/common';

import { ExpansionCitiesController } from './expansion-cities.controller';
import { ExpansionCitiesService } from './expansion-cities.service';

@Module({
  controllers: [ExpansionCitiesController],
  providers: [ExpansionCitiesService],
})
export class ExpansionCitiesModule {}
