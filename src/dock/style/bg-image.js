const MAX_WIDTH = 1920;
const JPEG_QUALITY = 0.85;
const UNREADABLE = 'That image could not be read.';

/**
 * Background images are downscaled before storage. A full-size photo as a data
 * URL can exceed the localStorage quota on its own, which would stop every
 * later settings save, and that would only show up mid-service.
 */
export function readBackgroundImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(UNREADABLE));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error(UNREADABLE));
      img.onload = () => {
        const ratio = Math.min(1, MAX_WIDTH / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        try { resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY)); } catch { resolve(e.target.result); }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
