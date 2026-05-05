import { Injectable } from '@nestjs/common';
import { Prisma, ReviewSubject } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  list(filter: { subject?: ReviewSubject; propertyId?: string; staffSubjectId?: string; isPublic?: boolean } = {}) {
    return this.prisma.review.findMany({
      where: {
        ...(filter.subject && { subject: filter.subject }),
        ...(filter.propertyId && { propertyId: filter.propertyId }),
        ...(filter.staffSubjectId && { staffSubjectId: filter.staffSubjectId }),
        ...(typeof filter.isPublic === 'boolean' && { isPublic: filter.isPublic }),
      },
      include: { author: true, photos: true, staffSubject: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  authoredBy(userId: string) {
    return this.prisma.review.findMany({
      where: { authorId: userId },
      include: { photos: true, property: true, staffSubject: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(dto: Prisma.ReviewUncheckedCreateInput & { photoUrls?: string[] }) {
    const { photoUrls, ...rest } = dto;
    return this.prisma.review.create({
      data: {
        ...rest,
        ...(photoUrls && { photos: { create: photoUrls.map((url, i) => ({ url, ordering: i })) } }),
      },
      include: { photos: true },
    });
  }

  approve(id: string) {
    return this.prisma.review.update({
      where: { id },
      data: { isApproved: true, isPublic: true },
    });
  }

  respond(id: string, responseBody: string) {
    return this.prisma.review.update({ where: { id }, data: { responseBody } });
  }

  remove(id: string) {
    return this.prisma.review.delete({ where: { id } });
  }
}
