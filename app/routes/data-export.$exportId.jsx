import { json } from "@remix-run/node";
import fs from 'fs';
import path from 'path';

export const loader = async ({ params }) => {
  const { exportId } = params;
  
  // Validate export ID format (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(exportId)) {
    throw new Response('Invalid export ID', { status: 400 });
  }

  // Find the export file
  const exportsDir = path.join(process.cwd(), 'data-exports');
  const files = fs.readdirSync(exportsDir).filter(file => file.includes(exportId));
  
  if (files.length === 0) {
    throw new Response('Export not found or expired', { status: 404 });
  }

  const filepath = path.join(exportsDir, files[0]);
  
  // Check if file exists and is not expired (30 days)
  const stats = fs.statSync(filepath);
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  
  if (stats.mtime.getTime() < thirtyDaysAgo) {
    // File is expired, delete it
    fs.unlinkSync(filepath);
    throw new Response('Export expired', { status: 410 });
  }

  // Read and return the file
  const fileContent = fs.readFileSync(filepath, 'utf8');
  const data = JSON.parse(fileContent);

  // Return as downloadable JSON file
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="customer-data-export-${exportId}.json"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
};
