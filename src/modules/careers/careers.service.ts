import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { JobApplicationStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../photos/storage.service';

const MAX_CV_BYTES = 5 * 1024 * 1024; // 5 MB

// PDF + DOC + DOCX — matches the file picker copy on msk-web.
// Each mime is paired with its expected extension so we can craft a
// reasonable filename for the bucket and serve back content-type
// consistently.
//
// TODO(privacy): CVs land in the same public R2 bucket as property photos
// under `job-applications/`. URLs are world-readable to anyone who knows
// the path. Acceptable for an MVP, but before we collect real applications
// at scale we should: (a) move CVs to a private bucket, (b) issue signed
// download URLs from the admin endpoint, (c) scrub the unguessable token
// from response payloads outside admin.
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const CV_MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

@Injectable()
export class CareersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

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

  async createJob(dto: Prisma.JobPostingCreateInput) {
    // Slug is required + unique on the model but the admin form only
    // asks for a title. Derive a kebab-case slug from the title and add
    // a short suffix on collision so retries succeed without UX friction.
    const data: Prisma.JobPostingCreateInput = {
      ...dto,
      slug: dto.slug || (await this.uniqueSlug(slugify(String(dto.title ?? '')))),
      publishedAt: dto.isPublished ? new Date() : undefined,
    };
    return this.prisma.jobPosting.create({ data });
  }

  async updateJob(id: string, dto: Prisma.JobPostingUpdateInput) {
    // If the title is being changed and the caller didn't pass an
    // explicit slug, regenerate it so the public URL tracks the new
    // title. (Existing applications still reference the job by id, so
    // the slug change doesn't break inbound links to applications.)
    const next: Prisma.JobPostingUpdateInput = { ...dto };
    if (typeof dto.title === 'string' && dto.slug === undefined) {
      const candidate = slugify(dto.title);
      const current = await this.prisma.jobPosting.findUnique({
        where: { id },
        select: { slug: true },
      });
      if (current && current.slug !== candidate) {
        next.slug = await this.uniqueSlug(candidate, id);
      }
    }
    // Track publishedAt with isPublished so the public list query is
    // accurate without an extra admin action.
    if (dto.isPublished === true) {
      next.publishedAt = next.publishedAt ?? new Date();
    }
    return this.prisma.jobPosting.update({ where: { id }, data: next });
  }

  private async uniqueSlug(base: string, excludeId?: string): Promise<string> {
    const safe = base || 'job';
    let candidate = safe;
    let n = 0;
    // Cap retries — collisions on slugs derived from real job titles
    // are extremely rare; this loop is just to keep the route safe.
    while (n < 50) {
      const existing = await this.prisma.jobPosting.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing || existing.id === excludeId) return candidate;
      n += 1;
      candidate = `${safe}-${n + 1}`;
    }
    return `${safe}-${Date.now()}`;
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

  /**
   * Public multipart application path used by msk-web's "Apply Now"
   * modal. Validates the job exists, sanity-checks the uploaded CV
   * (PDF, ≤ 5 MB), pushes the file to the object store under a
   * `job-applications/` prefix, and persists the row pointing at the
   * resulting URL.
   *
   * Returns only { id, createdAt } to the client — applicants don't
   * need anything else, and we don't want to echo back the cvUrl in
   * the response body (it lands in the bucket regardless).
   */
  async applyWithCv(input: {
    jobPostingId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    coverLetter?: string;
    cv: { buffer: Buffer; mimetype: string; size: number; originalname: string };
  }): Promise<{ id: string; createdAt: Date }> {
    if (!input.cv || !input.cv.buffer || input.cv.size === 0) {
      throw new BadRequestException('CV file is required.');
    }
    if (input.cv.size > MAX_CV_BYTES) {
      throw new PayloadTooLargeException(
        `CV must be ${Math.floor(MAX_CV_BYTES / 1024 / 1024)} MB or smaller.`,
      );
    }
    if (!CV_MIME_TO_EXT[input.cv.mimetype]) {
      throw new BadRequestException('CV must be a PDF, DOC, or DOCX file.');
    }

    const job = await this.prisma.jobPosting.findUnique({
      where: { id: input.jobPostingId },
      select: { id: true },
    });
    if (!job) throw new NotFoundException('Job posting not found.');

    const { url } = await this.storage.upload(
      input.cv.buffer,
      input.cv.mimetype,
      'job-applications',
    );

    const created = await this.prisma.jobApplication.create({
      data: {
        jobId: input.jobPostingId,
        fullName: `${input.firstName} ${input.lastName}`.trim(),
        email: input.email,
        phone: input.phone,
        coverLetter: input.coverLetter,
        cvUrl: url,
      },
      select: { id: true, createdAt: true },
    });
    return created;
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
