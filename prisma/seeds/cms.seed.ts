/* eslint-disable no-console */
// Standalone CMS seed — uses the exact same data definitions and logic as
// the SiteContentService.runSeed() method behind POST /site-content/seed.
// Run locally with:  npm run prisma:seed-cms
// Run against any environment by overriding DATABASE_URL beforehand.

import { PrismaClient } from '@prisma/client';

import {
  EXPANSION_CITIES_SEED,
  HOUSE_RULES_SEED,
  JOB_POSTINGS_SEED,
  SITE_CONTENT_SEED,
} from '../../src/modules/site-content/cms-seed-data';

const prisma = new PrismaClient();

async function main() {
  const dbHost = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? '').host;
    } catch {
      return '<unknown>';
    }
  })();
  console.log(`Seeding CMS into DB host: ${dbHost}`);

  // SiteContent: idempotent upsert by key. Don't overwrite `value` so
  // admin edits survive re-seeding; refresh metadata only.
  let siteContentUpserted = 0;
  for (const entry of SITE_CONTENT_SEED) {
    await prisma.siteContent.upsert({
      where: { key: entry.key },
      create: {
        key: entry.key,
        group: entry.group,
        label: entry.label,
        type: entry.type,
        value: entry.value,
        description: entry.description ?? null,
      },
      update: {
        group: entry.group,
        label: entry.label,
        type: entry.type,
        description: entry.description ?? null,
      },
    });
    siteContentUpserted += 1;
  }
  console.log(`  SiteContent upserted: ${siteContentUpserted}`);

  // Structured collections: only seed when empty so admin edits survive.
  const [houseRuleCount, expansionCityCount, jobCount] = await Promise.all([
    prisma.houseRule.count(),
    prisma.expansionCity.count(),
    prisma.jobPosting.count(),
  ]);

  if (houseRuleCount === 0) {
    await prisma.houseRule.createMany({ data: HOUSE_RULES_SEED });
    console.log(`  HouseRule inserted: ${HOUSE_RULES_SEED.length}`);
  } else {
    console.log(`  HouseRule skipped (table has ${houseRuleCount} rows)`);
  }

  if (expansionCityCount === 0) {
    await prisma.expansionCity.createMany({ data: EXPANSION_CITIES_SEED });
    console.log(`  ExpansionCity inserted: ${EXPANSION_CITIES_SEED.length}`);
  } else {
    console.log(`  ExpansionCity skipped (table has ${expansionCityCount} rows)`);
  }

  if (jobCount === 0) {
    await prisma.jobPosting.createMany({
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
    console.log(`  JobPosting inserted: ${JOB_POSTINGS_SEED.length}`);
  } else {
    console.log(`  JobPosting skipped (table has ${jobCount} rows)`);
  }

  console.log('Done.');
}

main()
  .catch((err) => {
    console.error('CMS seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
