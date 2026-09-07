import { Injectable, NotFoundException } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  list(status?: TicketStatus) {
    return this.prisma.supportTicket.findMany({
      where: status ? { status } : {},
      include: { company: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string) {
    const t = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: { company: { select: { id: true, name: true } } },
    });
    if (!t) throw new NotFoundException('Ticket not found');
    return t;
  }

  create(dto: { subject: string; body: string; fromEmail: string; companyId?: string }) {
    return this.prisma.supportTicket.create({ data: dto });
  }

  async reply(id: string, reply: string) {
    await this.get(id);
    return this.prisma.supportTicket.update({
      where: { id },
      data: { reply, status: TicketStatus.IN_PROGRESS, updatedAt: new Date() },
    });
  }

  async updateStatus(id: string, status: TicketStatus) {
    await this.get(id);
    return this.prisma.supportTicket.update({ where: { id }, data: { status } });
  }
}
