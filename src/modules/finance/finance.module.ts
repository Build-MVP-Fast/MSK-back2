import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { ReportsService } from './reports.service';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, ReportsService],
  exports: [FinanceService, ReportsService],
})
export class FinanceModule {}
