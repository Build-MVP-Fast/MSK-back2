import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../../../common/prisma/prisma.service';

interface JwtPayload {
  sub: string;
  email?: string;
  phone?: string;
  role: string;
  primaryRole?: string;
  companyId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-secret',
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || user.deletedAt) throw new UnauthorizedException();
    return {
      id: user.id,
      email: user.email ?? undefined,
      phone: user.phone ?? undefined,
      role: user.role,
      primaryRole: user.primaryRole ?? undefined,
      companyId: user.companyId ?? undefined,
    };
  }
}
