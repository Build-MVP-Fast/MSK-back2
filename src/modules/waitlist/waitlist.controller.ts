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
import { UserRole } from '@prisma/client';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { WaitlistService } from './waitlist.service';

// Roles offered on the msk-marketing form. Keeping the validator strict
// — anything outside this list is rejected so we don't accumulate junk
// values in the admin list later.
const ALLOWED_ROLES = [
  'Hotelier',
  'Resident manager',
  'STR host',
  'Concierge',
  'Other',
] as const;

class CreateWaitlistDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @IsOptional()
  @IsIn(ALLOWED_ROLES)
  role?: (typeof ALLOWED_ROLES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  propertyName?: string;

  @IsOptional()
  @IsString()
  @MinLength(7)
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsIn(['hero', 'footer'])
  source?: 'hero' | 'footer';
}

class UpdateNotesDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

/**
 * "Guestbook" — early-access signups from the msk-marketing landing page.
 * Public POST collects the entry, admin endpoints read/manage them.
 */
@ApiTags('waitlist')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly service: WaitlistService) {}

  @Public()
  @Post()
  signup(@Body() dto: CreateWaitlistDto) {
    return this.service.signup(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get()
  list(@Query('q') q?: string) {
    return this.service.list(q);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateNotesDto) {
    return this.service.updateNotes(id, body.notes ?? null);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_USER)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
