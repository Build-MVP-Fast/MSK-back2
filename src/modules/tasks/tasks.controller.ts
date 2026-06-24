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
import { TaskStatus, UserRole } from '@prisma/client';

import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { companyScope } from '../../common/util/company-scope';

import { TasksService } from './tasks.service';

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly service: TasksService) {}

  // STAFF can call this too, but only to read their own tasks — the
  // filter is forced to assigneeId = themselves regardless of what
  // they pass. Company scoping is enforced for everyone via
  // companyScope; SUPER_USER may pass cross-tenant companyId.
  @Roles(
    UserRole.ADMIN,
    UserRole.SUPER_USER,
    UserRole.RECEPTIONIST,
    UserRole.STAFF,
    UserRole.SUPERVISOR,
  )
  @Get()
  list(@Query() q: any, @CurrentUser() user: AuthenticatedUser) {
    const isStaffOnly = user.role === UserRole.STAFF;
    return this.service.list({
      ...q,
      ...(isStaffOnly ? { assigneeId: user.id } : {}),
      companyId: companyScope(user, q?.companyId),
    });
  }

  @Roles(
    UserRole.ADMIN,
    UserRole.SUPER_USER,
    UserRole.RECEPTIONIST,
    UserRole.STAFF,
    UserRole.SUPERVISOR,
  )
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Post()
  create(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.service.create({ ...dto, createdById: userId });
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  @Roles(
    UserRole.ADMIN,
    UserRole.SUPER_USER,
    UserRole.RECEPTIONIST,
    UserRole.STAFF,
    UserRole.SUPERVISOR,
  )
  @Post(':id/status')
  setStatus(@Param('id') id: string, @Body() body: { status: TaskStatus }) {
    return this.service.setStatus(id, body.status);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Post(':id/assign/:userId')
  assign(@Param('id') id: string, @Param('userId') userId: string) {
    return this.service.assign(id, userId);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Delete(':id/assign/:userId')
  unassign(@Param('id') id: string, @Param('userId') userId: string) {
    return this.service.unassign(id, userId);
  }

  // ── Reassign / steps / proof — Phase 1 additions ──────────────────
  // Steps and proof URLs live inside `TaskItem.metadata` JSON so we
  // didn't need a new migration. If/when reporting needs to query them
  // we can promote them to first-class tables.

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST, UserRole.SUPERVISOR)
  @Post(':id/reassign')
  reassign(@Param('id') id: string, @Body() body: { assigneeIds: string[] }) {
    return this.service.reassign(id, body.assigneeIds ?? []);
  }

  // Anyone who's a current assignee on the task can tick off steps —
  // we let the service enforce that.
  @Post(':id/steps/:stepId/complete')
  completeStep(
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { completed: boolean; proofUrl?: string },
  ) {
    return this.service.setStepCompleted(id, stepId, userId, body.completed, body.proofUrl);
  }

  // Replace the proof-photo URL list for the task. Multipart upload
  // happens out-of-band (mobile uploads to storage, then POSTs the
  // resulting URLs here); avoids streaming binary through this route.
  @Post(':id/proof')
  setProof(
    @Param('id') id: string,
    @Body() body: { urls: string[] },
  ) {
    return this.service.setProofUrls(id, body.urls ?? []);
  }
}
