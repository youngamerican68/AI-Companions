/**
 * Seed script for AI Companions Watch
 *
 * Populates the database with:
 * - Platform profiles
 * - Source credibility weights
 *
 * Run with: pnpm seed
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// =============================================================================
// Seed Data
// =============================================================================

const PLATFORMS = [
  {
    slug: 'replika',
    name: 'Replika',
    description:
      'AI companion app that uses neural networks to create personalized conversations. Known for emotional support features and customizable AI friends.',
    websiteUrl: 'https://replika.ai',
    policyNotes: null,
  },
  {
    slug: 'character-ai',
    name: 'Character.AI',
    description:
      'Platform for creating and chatting with AI characters. Features a wide variety of user-created characters and roleplay scenarios.',
    websiteUrl: 'https://character.ai',
    policyNotes: null,
  },
  {
    slug: 'nomi',
    name: 'Nomi',
    description:
      'AI companion focused on meaningful relationships and emotional intelligence. Offers personalized conversations and memory features.',
    websiteUrl: 'https://nomi.ai',
    policyNotes: null,
  },
  {
    slug: 'kindroid',
    name: 'Kindroid',
    description:
      'AI companion platform emphasizing customization and personality development. Features voice conversations and image generation.',
    websiteUrl: 'https://kindroid.ai',
    policyNotes: null,
  },
  {
    slug: 'paradot',
    name: 'Paradot',
    description:
      'AI companion app featuring 3D avatars and immersive conversation experiences.',
    websiteUrl: 'https://paradot.ai',
    policyNotes: null,
  },
  {
    slug: 'chai',
    name: 'Chai',
    description:
      'AI chat platform with a focus on entertainment and diverse AI personalities. Features user-created bots and interactive stories.',
    websiteUrl: 'https://chai.ml',
    policyNotes: null,
  },
  {
    slug: 'crushon-ai',
    name: 'CrushOn.AI',
    description:
      'AI chat platform offering unrestricted conversations with AI characters. Known for NSFW content policies.',
    websiteUrl: 'https://crushon.ai',
    policyNotes: null,
  },
  {
    slug: 'janitor-ai',
    name: 'Janitor AI',
    description:
      'Character-based AI chat platform with extensive customization options. Supports multiple LLM backends.',
    websiteUrl: 'https://janitorai.com',
    policyNotes: null,
  },
];

const SOURCE_CREDIBILITY = [
  // Tier 1: Major publications
  { sourceDomain: 'nytimes.com', weight: 0.95, notes: 'Major newspaper' },
  { sourceDomain: 'washingtonpost.com', weight: 0.9, notes: 'Major newspaper' },
  { sourceDomain: 'bloomberg.com', weight: 0.9, notes: 'Business news' },
  { sourceDomain: 'reuters.com', weight: 0.95, notes: 'News wire' },

  // Tier 2: Tech publications
  { sourceDomain: 'theverge.com', weight: 0.9, notes: 'Tech publication' },
  { sourceDomain: 'wired.com', weight: 0.85, notes: 'Tech publication' },
  { sourceDomain: 'techcrunch.com', weight: 0.85, notes: 'Tech publication' },
  { sourceDomain: 'arstechnica.com', weight: 0.85, notes: 'Tech publication' },
  { sourceDomain: 'technologyreview.com', weight: 0.9, notes: 'MIT Tech Review' },
  { sourceDomain: 'engadget.com', weight: 0.8, notes: 'Tech publication' },
  { sourceDomain: 'cnet.com', weight: 0.8, notes: 'Tech publication' },

  // Tier 3: Industry/AI specific
  { sourceDomain: 'venturebeat.com', weight: 0.75, notes: 'AI/tech news' },
  { sourceDomain: 'theinformation.com', weight: 0.85, notes: 'Tech industry' },
  { sourceDomain: 'buttondown.email', weight: 0.75, notes: 'AINews newsletter (legacy)' },
  { sourceDomain: 'news.smol.ai', weight: 0.75, notes: 'AINews newsletter' },

  // Tier 4: Social/community
  { sourceDomain: 'reddit.com', weight: 0.5, notes: 'Community discussion' },
  { sourceDomain: 'x.com', weight: 0.4, notes: 'Social media' },
  { sourceDomain: 'twitter.com', weight: 0.4, notes: 'Social media (legacy)' },

  // Tier 5: Regulatory
  { sourceDomain: 'ftc.gov', weight: 0.95, notes: 'Federal agency' },
  { sourceDomain: 'congress.gov', weight: 0.95, notes: 'Government' },
];

// =============================================================================
// Seed Functions
// =============================================================================

async function seedPlatforms() {
  console.log('Seeding platforms...');

  for (const platform of PLATFORMS) {
    await prisma.platform.upsert({
      where: { slug: platform.slug },
      update: {
        name: platform.name,
        description: platform.description,
        websiteUrl: platform.websiteUrl,
        policyNotes: platform.policyNotes,
      },
      create: platform,
    });
    console.log(`  - ${platform.name}`);
  }

  console.log(`Seeded ${PLATFORMS.length} platforms`);
}

async function seedCredibility() {
  console.log('Seeding source credibility weights...');

  for (const source of SOURCE_CREDIBILITY) {
    await prisma.sourceCredibility.upsert({
      where: { sourceDomain: source.sourceDomain },
      update: {
        weight: source.weight,
        notes: source.notes,
      },
      create: source,
    });
    console.log(`  - ${source.sourceDomain}: ${source.weight}`);
  }

  console.log(`Seeded ${SOURCE_CREDIBILITY.length} credibility weights`);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('Starting seed...\n');

  await seedPlatforms();
  console.log('');

  await seedCredibility();
  console.log('');

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
