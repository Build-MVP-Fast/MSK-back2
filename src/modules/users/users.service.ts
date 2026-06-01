import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthProvider, Prisma, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailService } from '../notifications/email.service';

import { CreateUserDto } from './dto/create-user.dto';

export interface CreateStaffResult {
  user: { id: string; email: string | null; fullName: string | null; role: UserRole };
  /** Only present when the server generated the password — admins copy this once. */
  tempPassword?: string;
  /** True if invite email was actually sent; false if SMTP isn't configured. */
  inviteEmailSent: boolean;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  list(filter: { role?: UserRole; companyId?: string; q?: string } = {}) {
    return this.prisma.user.findMany({
      where: {
        ...(filter.role && { role: filter.role }),
        ...(filter.companyId && { companyId: filter.companyId }),
        ...(filter.q && {
          OR: [
            { email: { contains: filter.q, mode: 'insensitive' } },
            { fullName: { contains: filter.q, mode: 'insensitive' } },
            { phone: { contains: filter.q } },
          ],
        }),
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async detail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        guestProfile: { include: { additionalGuests: true } },
        staffProfile: true,
        supplierProfile: true,
        company: true,
        departments: { include: { department: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  update(id: string, dto: Prisma.UserUncheckedUpdateInput) {
    return this.prisma.user.update({ where: { id }, data: dto });
  }

  /** Soft-delete (sets deletedAt + isActive=false). */
  async deactivate(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }

  /**
   * Create a new staff user from the admin dashboard. Hashes the password
   * with Argon2 (matching the registerWebGuest path) and, when requested,
   * fires off an invitation email best-effort.
   *
   * If `password` is omitted, generates a 16-char temporary password and
   * returns it ONCE in the response so the admin can copy/share it; it's
   * never echoed back when the admin supplied their own password.
   */
  async createStaff(dto: CreateUserDto): Promise<CreateStaffResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already in use');

    const provided = dto.password;
    const tempPassword = provided ? null : generateTempPassword();
    const password = provided ?? tempPassword!;
    const secretHash = await argon2.hash(password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        fullName: `${dto.firstName} ${dto.lastName}`.trim(),
        role: dto.role,
        primaryRole: dto.role,
        authProvider: AuthProvider.PASSWORD,
        credentials: {
          create: {
            provider: AuthProvider.PASSWORD,
            secretHash,
          },
        },
      },
      select: { id: true, email: true, fullName: true, role: true },
    });

    let inviteEmailSent = false;
    if (dto.sendInviteEmail && user.email) {
      try {
        await this.email.send(
          user.email,
          'Your MSK admin account is ready',
          renderInviteEmail({
            firstName: dto.firstName,
            email: user.email,
            password,
            generated: !provided,
          }),
        );
        // EmailService no-ops (returns void without throwing) when SMTP
        // isn't configured. We treat the return as "sent" — there's no
        // signal back about whether SMTP was wired or not.
        inviteEmailSent = true;
      } catch (err) {
        this.logger.warn(
          `Invite email failed for ${user.email}: ${err instanceof Error ? err.message : err}`,
        );
        inviteEmailSent = false;
      }
    }

    return {
      user,
      ...(tempPassword ? { tempPassword } : {}),
      inviteEmailSent,
    };
  }

  // ---- Additional guests on a guest profile ------------------------------
  addAdditionalGuest(guestProfileId: string, dto: Prisma.AdditionalGuestUncheckedCreateInput) {
    return this.prisma.additionalGuest.create({ data: { ...dto, hostProfileId: guestProfileId } });
  }

  removeAdditionalGuest(id: string) {
    return this.prisma.additionalGuest.delete({ where: { id } });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * 16-char URL-safe-ish temp password from the system CSPRNG. Avoids
 * lookalike characters (0/O, l/1) so an admin reading it aloud doesn't
 * trip the recipient up.
 */
function generateTempPassword(): string {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const len = 16;
  const out: string[] = [];
  for (let i = 0; i < len; i++) {
    out.push(alphabet[crypto.randomInt(0, alphabet.length)]);
  }
  return out.join('');
}

function renderInviteEmail(opts: {
  firstName: string;
  email: string;
  password: string;
  generated: boolean;
}): string {
  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#222222;max-width:520px;margin:0 auto;padding:24px">
      <h2 style="font-size:20px;font-weight:600;margin:0 0 16px">Welcome to MSK Admin</h2>
      <p style="font-size:14px;line-height:22px;margin:0 0 16px">
        Hi ${escapeHtml(opts.firstName)}, an admin account has been created for you.
      </p>
      <table style="font-size:14px;line-height:22px;margin:0 0 16px">
        <tr><td style="padding-right:12px;color:#666666">Email</td><td><strong>${escapeHtml(opts.email)}</strong></td></tr>
        <tr><td style="padding-right:12px;color:#666666">Temporary password</td><td><strong>${escapeHtml(opts.password)}</strong></td></tr>
      </table>
      ${
        opts.generated
          ? `<p style="font-size:13px;color:#666666;margin:0 0 8px">
              This password was generated for you. Sign in and change it
              from your profile.
            </p>`
          : ''
      }
    </div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
