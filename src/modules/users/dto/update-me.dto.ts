import { IsEmail, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body for the self-service PATCH /users/me endpoint. Restricted to
 * fields a guest is allowed to change about themselves — name, email,
 * phone — so a malicious client can't elevate their role, mark
 * themselves as a SUPER_USER, flip isActive, or rotate companyId by
 * posting the field name. The Mobile guest profile's "edit info"
 * action and the Add Email / Add Phone modals POST through here.
 */
export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(7)
  @MaxLength(32)
  phone?: string;

  /**
   * Free-form supplementary fields. Supplier company-details and
   * bank-details screens persist their data here until a dedicated
   * column lands. Merged on top of any existing User.metadata; not
   * replaced wholesale.
   */
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
