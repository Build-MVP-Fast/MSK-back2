import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JobApplicationStatus, UserRole } from '@prisma/client';

import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { CareersService } from './careers.service';

@ApiTags('careers')
@Controller('careers')
export class CareersController {
  constructor(private readonly service: CareersService) {}

  // ---- Public (website) ---------------------------------------------------

  @Public()
  @Get('jobs')
  publicListJobs() {
    return this.service.publicListJobs();
  }

  @Public()
  @Get('jobs/:slug')
  publicJobBySlug(@Param('slug') slug: string) {
    return this.service.publicJobBySlug(slug);
  }

  @Public()
  @Post('jobs/:jobId/apply')
  apply(@Param('jobId') jobId: string, @Body() dto: any) {
    return this.service.apply({ ...dto, jobId });
  }

  // ---- Admin --------------------------------------------------------------

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get('admin/jobs')
  listJobs() {
    return this.service.listJobs();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Post('admin/jobs')
  createJob(@Body() dto: any) {
    return this.service.createJob(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Patch('admin/jobs/:id')
  updateJob(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateJob(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_USER)
  @Delete('admin/jobs/:id')
  removeJob(@Param('id') id: string) {
    return this.service.removeJob(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get('admin/applications')
  listApplications(@Query() q: { jobId?: string; status?: JobApplicationStatus }) {
    return this.service.listApplications(q);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Patch('admin/applications/:id')
  setApplicationStatus(
    @Param('id') id: string,
    @Body() body: { status: JobApplicationStatus; notes?: string },
  ) {
    return this.service.setApplicationStatus(id, body.status, body.notes);
  }
}
