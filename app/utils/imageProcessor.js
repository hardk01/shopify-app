import { Buffer } from 'buffer';

// Browser-based image compression utility
async function compressImage(imageUrl, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      // Convert quality from 0-100 to 0-1
      const normalizedQuality = Math.max(0, Math.min(100, quality)) / 100;
      
      canvas.toBlob(
        (blob) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              dataUrl: reader.result,
              info: {
                width: img.width,
                height: img.height,
                size: blob.size,
                originalSize: blob.size // In browser mode, we don't have access to original size
              }
            });
          };
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        normalizedQuality
      );
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    img.src = imageUrl;
  });
}

export { compressImage }; 