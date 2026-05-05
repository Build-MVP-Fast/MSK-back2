import { Injectable, NotFoundException } from '@nestjs/common';
import { JobApplicationStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class CareersService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Job postings -------------------------------------------------------

  publicListJobs() {
    return this.prisma.jobPosting.findMany({
      where: { isPublished: true, OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }] },
      orderBy: { publishedAt: 'desc' },
    });
  }

  async publicJobBySlug(slug: string) {
    const job = await this.prisma.jobPosting.findUnique({ where: { slug } });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  listJobs() {
    return this.prisma.jobPosting.findMany({ orderBy: { createdAt: 'desc' } });
  }

  createJob(dto: Prisma.JobPostingCreateInput) {
    return this.prisma.jobPosting.create({
      data: { ...dto, publishedAt: dto.isPublished ? new Date() : undefined },
    });
  }

  updateJob(id: string, dto: Prisma.JobPostingUpdateInput) {
    return this.prisma.jobPosting.update({ where: { id }, data: dto });
  }

  removeJob(id: string) {
    return this.prisma.jobPosting.delete({ where: { id } });
  }

  // ---- Applications -------------------------------------------------------

  apply(dto: {
    jobId: string;
    fullName: string;
    email: string;
    phone?: string;
    coverLetter?: string;
    cvUrl?: string;
    cvData?: any;
    applicantUserId?: string;
  }) {
    return this.prisma.jobApplication.create({ data: dto });
  }

  listApplications(filter: { jobId?: string; status?: JobApplicationStatus } = {}) {
    return this.prisma.jobApplication.findMany({
      where: {
        ...(filter.jobId && { jobId: filter.jobId }),
        ...(filter.status && { status: filter.status }),
      },
      include: { job: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  setApplicationStatus(id: string, status: JobApplicationStatus, notes?: string) {
    return this.prisma.jobApplication.update({
      where: { id },
      data: { status, notes },
    });
  }
}
