/**
 * Seed script to initialize the database with an admin API key
 * Run with: bun run seed.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Starting database seed...');

  try {
    // Check if admin key already exists
    const existingAdminKey = await prisma.apiKey.findFirst({
      where: { type: 'admin' },
    });

    if (existingAdminKey) {
      console.log('✅ Admin API key already exists');
      console.log(`   UID: ${existingAdminKey.uid}`);
      console.log(`   Key: ${existingAdminKey.keyValue}`);
      return;
    }

    // Generate UID
    const uid = crypto.randomUUID();

    // Create admin API key with the specified value
    const adminKey = await prisma.apiKey.create({
      data: {
        uid: uid,
        keyValue: 'MutanoX3397',
        name: 'Admin Principal',
        type: 'admin',
        isActive: true,
      },
    });

    console.log('✅ Admin API key created successfully');
    console.log(`   UID: ${adminKey.uid}`);
    console.log(`   Key: ${adminKey.keyValue}`);
    console.log('');
    console.log('⚠️  IMPORTANT: This is your master admin key for accessing dashboard.');
    console.log('   API Key: MutanoX3397');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

seed()
  .then(async () => {
    console.log('✅ Seed completed successfully');
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('❌ Seed failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
