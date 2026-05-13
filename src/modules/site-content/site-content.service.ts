import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import {
  EXPANSION_CITIES_SEED,
  HOUSE_RULES_SEED,
  JOB_POSTINGS_SEED,
  SITE_CONTENT_SEED,
} from './cms-seed-data';

@Injectable()
export class SiteContentService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Public reads ──────────────────────────────────────────────────────

  /** Flat key→value map for the public site to consume cheaply. */
  async publicAll(): Promise<Record<string, string>> {
    const rows = await this.prisma.siteContent.findMany({
      select: { key: true, value: true },
    });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  /** Same shape, scoped to one group (e.g. "hero", "footer"). */
  async publicByGroup(group: string): Promise<Record<string, string>> {
    const rows = await this.prisma.siteContent.findMany({
      where: { group },
      select: { key: true, value: true },
    });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  // ── Admin reads ───────────────────────────────────────────────────────

  /** Full entries with metadata, ordered by group then key for stable UI. */
  listAll() {
    return this.prisma.siteContent.findMany({
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
    });
  }

  // ── Admin writes ──────────────────────────────────────────────────────

  async update(key: string, value: string, userId?: string) {
    const existing = await this.prisma.siteContent.findUnique({ where: { key } });
    if (!existing) throw new NotFoundException(`No SiteContent with key "${key}"`);
    return this.prisma.siteContent.update({
      where: { key },
      data: { value, updatedById: userId ?? null },
    });
  }

  /**
   * Idempotent CMS seed: upserts every SiteContent row by key, and seeds the
   * structured tables (HouseRule, ExpansionCity, JobPosting) only if their
   * tables are currently empty — never overwriting admin-edited content.
   * FAQs and Testimonials seed as zero rows because the website doesn't ship
   * hardcoded values for them.
   */
  async runSeed(userId?: string) {
    let siteContentUpserted = 0;
    for (const entry of SITE_CONTENT_SEED) {
      await this.prisma.siteContent.upsert({
        where: { key: entry.key },
        create: {
          key: entry.key,
          group: entry.group,
          label: entry.label,
          type: entry.type,
          value: entry.value,
          description: entry.description ?? null,
          updatedById: userId ?? null,
        },
        update: {
          // Don't clobber the value on re-seed; the admin may have edited it.
          // Only refresh metadata (label / type / description / group) so
          // schema changes propagate without losing user edits.
          group: entry.group,
          label: entry.label,
          type: entry.type,
          description: entry.description ?? null,
        },
      });
      siteContentUpserted += 1;
    }

    const [houseRuleCount, expansionCityCount, jobCount] = await Promise.all([
      this.prisma.houseRule.count(),
      this.prisma.expansionCity.count(),
      this.prisma.jobPosting.count(),
    ]);

    let houseRulesInserted = 0;
    if (houseRuleCount === 0) {
      await this.prisma.houseRule.createMany({ data: HOUSE_RULES_SEED });
      houseRulesInserted = HOUSE_RULES_SEED.length;
    }

    let expansionCitiesInserted = 0;
    if (expansionCityCount === 0) {
      await this.prisma.expansionCity.createMany({ data: EXPANSION_CITIES_SEED });
      expansionCitiesInserted = EXPANSION_CITIES_SEED.length;
    }

    let jobPostingsInserted = 0;
    if (jobCount === 0) {
      await this.prisma.jobPosting.createMany({
        data: JOB_POSTINGS_SEED.map((j) => ({
          title: j.title,
          slug: j.slug,
          description: j.description,
          location: j.location,
          employmentType: j.employmentType,
          isPublished: true,
          publishedAt: new Date(),
        })),
      });
      jobPostingsInserted = JOB_POSTINGS_SEED.length;
    }

    return {
      siteContentUpserted,
      houseRulesInserted,
      expansionCitiesInserted,
      jobPostingsInserted,
      testimonialsInserted: 0,
      faqsInserted: 0,
    };
  }
}
