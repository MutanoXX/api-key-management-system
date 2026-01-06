// ==========================================
// API KEY MANAGEMENT SYSTEM - MAIN SERVER (ES MODULE)
// ==========================================
// This file is an ES module wrapper that imports from index.cjs (CommonJS)
// This resolves the require() issue with DISCLOUD

import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Import the CommonJS server
const server = require('./index.cjs');

// Start the server
// The server is already started in index.cjs, this just imports it
console.log('✅ ES Module wrapper loaded');
console.log('📦 CommonJS server imported from index.cjs');
