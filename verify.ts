// ==========================================
// SYSTEM VERIFICATION - Check all configurations
// ==========================================

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('\n🔍 Starting System Verification...\n');

// Check files exist
async function checkFile(filePath, description) {
  try {
    await fs.access(filePath);
    console.log(`✅ ${description}: EXISTS`);
    return true;
  } catch (error) {
    console.log(`❌ ${description}: NOT FOUND`);
    return false;
  }
}

// Check database files
console.log('📁 Checking Database Files...');
const dbFiles = [
  'database/api-keys.json',
  'database/subscriptions.json',
  'database/payments.json',
  'database/usage-logs.json',
  'database/audit-logs.json',
  'database/jwt-blacklist.json',
  'database/db-info.json',
];

for (const file of dbFiles) {
  await checkFile(path.join(__dirname, file), file);
}

// Check server files
console.log('\n📁 Checking Server Files...');
const serverFiles = [
  'index.ts',
  'index.cjs',
  'index.mjs',
  'discloud.config',
];

for (const file of serverFiles) {
  await checkFile(path.join(__dirname, file), file);
}

// Check database content
console.log('\n📊 Checking Database Content...');
try {
  const apiKeys = JSON.parse(await fs.readFile(path.join(__dirname, 'database/api-keys.json'), 'utf-8'));
  console.log(`✅ API Keys: ${apiKeys.length} found`);
  
  const adminKey = apiKeys.find(k => k.type === 'admin');
  if (adminKey) {
    console.log(`✅ Admin Key: ${adminKey.keyValue} (${adminKey.name})`);
    console.log(`✅ Admin UID: ${adminKey.uid}`);
  } else {
    console.log('⚠️  Admin Key: NOT FOUND (run: bun run seed)');
  }
} catch (error) {
  console.log(`❌ Error reading database: ${error.message}`);
}

// Check package.json
console.log('\n📦 Checking package.json...');
try {
  const packageJson = JSON.parse(await fs.readFile(path.join(__dirname, 'package.json'), 'utf-8'));
  console.log(`✅ Package Name: ${packageJson.name}`);
  console.log(`✅ Version: ${packageJson.version}`);
  console.log(`✅ Type: ${packageJson.type}`);
  console.log(`✅ Dependencies: ${Object.keys(packageJson.dependencies).length} found`);
} catch (error) {
  console.log(`❌ Error reading package.json: ${error.message}`);
}

// Check discloud.config
console.log('\n☁️  Checking discloud.config...');
try {
  const discloudConfig = await fs.readFile(path.join(__dirname, 'discloud.config'), 'utf-8');
  const lines = discloudConfig.split('\n');
  
  for (const line of lines) {
    if (line.includes('MAIN=') || line.includes('START=')) {
      console.log(`✅ ${line.trim()}`);
    }
  }
} catch (error) {
  console.log(`❌ Error reading discloud.config: ${error.message}`);
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('📋 SYSTEM VERIFICATION SUMMARY');
console.log('='.repeat(50));
console.log('\n🚀 Deployment Options:\n');
console.log('1. Local Development:');
console.log('   bun run dev  (uses index.ts)');
console.log('\n2. Production:');
console.log('   bun run start  (uses index.ts)');
console.log('\n3. DISCLOUD:');
console.log('   Upload discloud.config');
console.log('   MAIN=index.mjs (ES Module wrapper)');
console.log('   START=node index.mjs\n');

console.log('🔑 Admin API Key: MutanoX3397');
console.log('📊 Dashboard: /api/dashboard/apikeys');
console.log('📁 Database: JSON files in ./database\n');

console.log('✅ Verification Complete!\n');
