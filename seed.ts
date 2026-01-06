/**
 * Seed script to initialize the database with an admin API key
 * Run with: bun run seed
 */

import * as db from './database/db.js';

async function seed() {
  console.log('🌱 Starting database seed...');

  try {
    // Check if admin key already exists
    const apiKeys = await db.findAllApiKeys();
    const existingAdminKey = apiKeys.find(k => k.type === 'admin');

    if (existingAdminKey) {
      console.log('✅ Admin API key already exists');
      console.log(`   UID: ${existingAdminKey.uid}`);
      console.log(`   Key: ${existingAdminKey.keyValue}`);
      return;
    }

    // Create admin API key with specified value
    const adminKey = await db.createApiKey({
      keyValue: 'MutanoX3397',
      name: 'Admin Principal',
      type: 'admin',
      isActive: true,
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
  .then(() => {
    console.log('✅ Seed completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  });
