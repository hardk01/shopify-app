#!/usr/bin/env node

// Cleanup script for expired customer data exports
// Run this script periodically (e.g., daily via cron job) to clean up expired exports

import { cleanupExpiredExports } from '../app/utils/customerDataService.js';
import fs from 'fs';
import path from 'path';

const runCleanup = () => {
  console.log('Starting cleanup of expired customer data exports...');
  
  const exportsDir = path.join(process.cwd(), 'data-exports');
  
  // Check if exports directory exists
  if (!fs.existsSync(exportsDir)) {
    console.log('No exports directory found. Nothing to clean up.');
    return;
  }

  // Get initial file count
  const initialFiles = fs.readdirSync(exportsDir);
  console.log(`Found ${initialFiles.length} export files`);

  // Run cleanup
  try {
    cleanupExpiredExports();
    
    // Get final file count
    const finalFiles = fs.readdirSync(exportsDir);
    const deletedCount = initialFiles.length - finalFiles.length;
    
    console.log(`Cleanup completed. Deleted ${deletedCount} expired files.`);
    console.log(`Remaining files: ${finalFiles.length}`);
    
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
};

// Run the cleanup
runCleanup();
