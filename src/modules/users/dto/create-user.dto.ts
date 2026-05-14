import { UserRole } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Body for admin-created staff: POST /users.
 *
 * Distinct from the public registration endpoints (which create guest
 * users via PIN/password). This is for the admin to add their colleagues
 * with a chosen role. The role allow-list is enforced on the controller
 * (ADMIN + SUPER_USER may invoke this; assigning SUPER_USER is allowed
 * only by an existing SUPER_USER — see UsersService.createStaff).
 */
export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  lastName!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  /** Optional. If omitted, the server generates a temporary password. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password?: string;

  /**
   * Best-effort invitation email with the (generated or provided)
   * credentials. Silently skipped when SMTP isn't configured, same as
   * the forgot-password flow.
   */
  @IsOptional()
  @IsBoolean()
  sendInviteEmail?: boolean;
}
