import { Module } from '@nestjs/common';
import { HandbookController } from './handbook.controller';
import { HandbookService } from './handbook.service';

@Module({
  controllers: [HandbookController],
  providers: [HandbookService],
  exports: [HandbookService],
})
export class HandbookModule {}
