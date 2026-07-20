import { Module } from '@nestjs/common';

import { HandbookDocumentsController } from './handbook-documents.controller';
import { HandbookDocumentsService } from './handbook-documents.service';

@Module({
  controllers: [HandbookDocumentsController],
  providers: [HandbookDocumentsService],
  exports: [HandbookDocumentsService],
})
export class HandbookDocumentsModule {}
