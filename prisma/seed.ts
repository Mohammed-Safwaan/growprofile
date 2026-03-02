/**
 * prisma/seed.ts — Database seeder for GrowProfile
 *
 * Run: pnpm db:seed  (or: npx tsx prisma/seed.ts)
 *
 * Creates:
 *  - Default plans (Starter, Creator)
 *  - Default system settings
 *  - An admin user (if ADMIN_EMAIL + ADMIN_FIREBASE_UID env vars are set)
 */

import { PrismaClient, UserRole, PlanType } from '../lib/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ──────────────────────────────────────────────
// Plans
// ──────────────────────────────────────────────
async function seedPlans() {
  const plans = [
    {
      name: PlanType.STARTER,
      displayName: 'Starter',
      price: 0,
      firstMonthPrice: null,
      maxIgAccounts: 1,
      maxLeads: 10,
      features: {
        commentDm: true,
        storyReply: false,
        liveDm: false,
        dmKeyword: false,
        followGate: false,
        emailCollection: false,
        prioritySupport: false,
      },
      allowReels: true,
      allowPosts: true,
      allowStories: false,
      allowDms: false,
      allowLives: false,
      advancedFlows: false,
    },
    {
      name: PlanType.CREATOR,
      displayName: 'Creator',
      price: 29,
      firstMonthPrice: 9,
      maxIgAccounts: 5,
      maxLeads: -1, // unlimited
      features: {
        commentDm: true,
        storyReply: true,
        liveDm: true,
        dmKeyword: true,
        followGate: true,
        emailCollection: true,
        prioritySupport: true,
        analytics: true,
        customBranding: true,
      },
      allowReels: true,
      allowPosts: true,
      allowStories: true,
      allowDms: true,
      allowLives: true,
      advancedFlows: true,
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { name: plan.name },
      update: {
        displayName: plan.displayName,
        price: plan.price,
        firstMonthPrice: plan.firstMonthPrice,
        maxIgAccounts: plan.maxIgAccounts,
        maxLeads: plan.maxLeads,
        features: plan.features,
        allowReels: plan.allowReels,
        allowPosts: plan.allowPosts,
        allowStories: plan.allowStories,
        allowDms: plan.allowDms,
        allowLives: plan.allowLives,
        advancedFlows: plan.advancedFlows,
      },
      create: plan,
    });
  }

  console.log('✅ Plans seeded (Starter + Creator)');
}

// ──────────────────────────────────────────────
// System Settings
// ──────────────────────────────────────────────
async function seedSettings() {
  const defaults: Record<string, unknown> = {
    // General
    site_name: 'GrowProfile',
    maintenance_mode: false,
    max_campaigns_per_user: 10,
    default_plan: 'STARTER',

    // Rate limits
    dm_rate_limit_per_hour: 50,
    comment_reply_rate_limit_per_hour: 100,
    api_rate_limit_per_minute: 60,

    // Abuse detection
    abuse_auto_suspend: true,
    abuse_flag_threshold: 5,
    spam_dm_threshold: 20,
    spam_campaign_threshold: 10,
    token_failure_threshold: 15,

    // Email
    email_from_name: 'GrowProfile',
    email_from_address: 'hello@growprofile.com',
    weekly_digest_enabled: true,

    // Instagram / Meta
    ig_webhook_verify_token: 'growprofile_webhook_verify',
    ig_api_version: 'v25.0',
  };

  for (const [key, value] of Object.entries(defaults)) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: {}, // don't overwrite admin changes
      create: {
        key,
        value: value as any,
      },
    });
  }

  console.log('✅ System settings seeded (' + Object.keys(defaults).length + ' defaults)');
}

// ──────────────────────────────────────────────
// Admin User (optional)
// ──────────────────────────────────────────────
async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const firebaseUid = process.env.ADMIN_FIREBASE_UID;

  if (!email || !firebaseUid) {
    console.log('⏭️  Skipping admin user (set ADMIN_EMAIL + ADMIN_FIREBASE_UID to create one)');
    return;
  }

  const starterPlan = await prisma.plan.findUnique({ where: { name: PlanType.STARTER } });

  await prisma.user.upsert({
    where: { firebaseUid },
    update: { role: UserRole.ADMIN },
    create: {
      firebaseUid,
      email,
      name: 'Admin',
      role: UserRole.ADMIN,
      planId: starterPlan?.id,
    },
  });

  // Audit log
  const admin = await prisma.user.findUnique({ where: { firebaseUid } });
  if (admin) {
    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: 'admin.seeded',
        entityType: 'User',
        entityId: admin.id,
        details: { method: 'prisma/seed.ts' },
      },
    });
  }

  console.log(`✅ Admin user seeded (${email})`);
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────
async function main() {
  console.log('🌱 Seeding GrowProfile database...\n');

  await seedPlans();
  await seedSettings();
  await seedAdmin();

  console.log('\n🎉 Seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
