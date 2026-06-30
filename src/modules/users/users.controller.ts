import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AccountKind, UserRole } from '@prisma/client';

import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { companyScope } from '../../common/util/company-scope';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Get()
  list(@Query() q: any, @CurrentUser() user: AuthenticatedUser) {
    return this.service.list({ ...q, companyId: companyScope(user, q?.companyId) });
  }

  /**
   * Admin-created staff. Only ADMIN / SUPER_USER may invoke. Promoting a
   * new user to SUPER_USER is additionally gated to existing SUPER_USERs
   * — that prevents an ADMIN from quietly granting themselves higher
   * privileges by creating a SUPER_USER teammate.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @RequirePermission('users.create')
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() caller: AuthenticatedUser) {
    if (dto.role === UserRole.SUPER_USER && caller.role !== UserRole.SUPER_USER) {
      throw new BadRequestException(
        'Only a SUPER_USER can create another SUPER_USER account.',
      );
    }
    // ADMIN flow (Property Operator adds staff from the mobile app)
    // → stamp the new user with companyId from the caller's JWT and
    // accountKind=APP so they show up under the operator's tenant. The
    // msk-admin web flow keeps the existing PLATFORM-lane default.
    if (caller.role === UserRole.ADMIN) {
      return this.service.createStaff({
        ...dto,
        companyId: caller.companyId,
        accountKind: AccountKind.APP,
      });
    }
    return this.service.createStaff(dto);
  }

  @Get('me')
  me(@CurrentUser('id') userId: string) {
    return this.service.detail(userId);
  }

  /**
   * Self-service profile edit. DTO restricts to firstName / lastName /
   * fullName / email / phone — no role / isActive / companyId. Anything
   * else in the body is dropped by the global ValidationPipe's
   * whitelist mode. The mobile guest profile and the Add Email / Add
   * Phone modals POST through this endpoint.
   */
  @Patch('me')
  updateMe(@Body() dto: UpdateMeDto, @CurrentUser('id') userId: string) {
    // Cast through unknown — the metadata field is `Record<string, unknown>`
    // on the DTO (for class-validator) but Prisma's InputJsonValue is the
    // narrower target. The service's merge logic handles either.
    return this.service.update(userId, dto as unknown as Parameters<typeof this.service.update>[1]);
  }

  /**
   * Self-service upload for the post-check-in profile screen. Accepts a
   * single image file plus a `kind` field of `ID` or `SIGNATURE`; the
   * stored URL is written into the corresponding slot on User.metadata
   * (idDocumentUrl / signatureUrl) so the existing JSON column carries
   * it without a schema migration.
   */
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  @Post('me/document')
  uploadMeDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body('kind') kind: string,
    @CurrentUser('id') userId: string,
  ) {
    if (!file) throw new BadRequestException('File is required');
    if (
      kind !== 'ID' &&
      kind !== 'SIGNATURE' &&
      kind !== 'SELFIE' &&
      kind !== 'COMPANY_LOGO'
    ) {
      throw new BadRequestException(
        'kind must be "ID", "SIGNATURE", "SELFIE", or "COMPANY_LOGO"',
      );
    }
    return this.service.uploadGuestDocument(userId, kind, file);
  }

  /**
   * Self-service account deletion. Any authenticated user may soft-delete
   * their OWN account (sets isActive=false + deletedAt); they're signed
   * out immediately and can no longer log in. No @Roles — every role can
   * remove their own account. Declared before @Delete(':id') so the
   * literal "me" segment isn't captured as an :id param.
   */
  @Delete('me')
  deleteMe(@CurrentUser('id') userId: string) {
    return this.service.deactivate(userId);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @RequirePermission('users.update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  // ADMIN (Property Operator, own tenant only) and SUPER_USER (platform)
  // may deactivate a staff user. Role + tenant scoping in the service is
  // the security boundary. Intentionally no @RequirePermission: the
  // permission matrix is seeded once at first boot and existing tenants
  // never see policy edits — using role-only here avoids stranding live
  // operators outside the feature.
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Delete(':id')
  deactivate(@Param('id') id: string, @CurrentUser() caller: AuthenticatedUser) {
    const scopeCompanyId =
      caller.role === UserRole.ADMIN ? caller.companyId ?? undefined : undefined;
    return this.service.deactivate(id, scopeCompanyId);
  }

  @Post(':guestProfileId/additional-guests')
  addAdditionalGuest(@Param('guestProfileId') guestProfileId: string, @Body() dto: any) {
    return this.service.addAdditionalGuest(guestProfileId, dto);
  }

  @Delete('additional-guests/:id')
  removeAdditionalGuest(@Param('id') id: string) {
    return this.service.removeAdditionalGuest(id);
  }
}
