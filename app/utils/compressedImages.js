import fs from 'fs/promises';
const FILE_PATH = './compressedImages.json';

export async function getCompressedImages() {
  try {
    const data = await fs.readFile(FILE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export async function saveCompressedImage(id, compressedSize) {
  const all = await getCompressedImages();
  all[id] = {
    compressedSize,
    compressedAt: new Date().toISOString()
  };
  await fs.writeFile(FILE_PATH, JSON.stringify(all, null, 2));
} 