import { useState } from 'react';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 400;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('خواندن تصویر انتخاب‌شده ناموفق بود.'));
  reader.readAsDataURL(blob);
});

const canvasToWebp = (canvas, quality) => new Promise((resolve) => {
  canvas.toBlob(resolve, 'image/webp', quality);
});

async function compressImage(canvas, image) {
  let quality = 0.8;
  while (true) {
    const blob = await canvasToWebp(canvas, quality);
    if (!blob) throw new Error('فشرده‌سازی تصویر ناموفق بود.');
    if (blob.size <= MAX_FILE_SIZE) return blob;

    if (quality > 0.4) {
      quality = Math.max(0.4, quality - 0.1);
      continue;
    }

    if (canvas.width === 1 && canvas.height === 1) {
      throw new Error('کاهش حجم تصویر به کمتر از ۵ مگابایت ممکن نشد.');
    }

    canvas.width = Math.max(1, Math.floor(canvas.width * 0.75));
    canvas.height = Math.max(1, Math.floor(canvas.height * 0.75));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('پردازش تصویر در این مرورگر ممکن نیست.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    quality = 0.8;
  }
}

export default function ImageUpload({ value, onChange, onError, label = 'تصویر کالا' }) {
  const [processing, setProcessing] = useState(false);
  const [brokenPreview, setBrokenPreview] = useState(false);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!ACCEPTED_TYPES.has(file.type)) {
      onError('فرمت تصویر باید JPG، PNG یا WebP باشد.');
      return;
    }

    setProcessing(true);
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('فایل انتخاب‌شده تصویر معتبر نیست.'));
        image.src = objectUrl;
      });
      const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('پردازش تصویر در این مرورگر ممکن نیست.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await compressImage(canvas, image);
      onChange(await blobToDataUrl(blob));
      setBrokenPreview(false);
    } catch (error) {
      onError(error.message);
    } finally {
      URL.revokeObjectURL(objectUrl);
      setProcessing(false);
    }
  };

  return (
    <div className="image-upload" dir="rtl">
      <span className="image-upload-label">{label}</span>
      <div className="image-upload-content">
        {value && !brokenPreview ? (
          <img
            className="image-upload-preview"
            src={value}
            alt={`پیش‌نمایش ${label}`}
            loading="lazy"
            onError={() => setBrokenPreview(true)}
          />
        ) : (
          <span className="image-upload-placeholder" aria-hidden="true">▧</span>
        )}
        <div className="image-upload-actions">
          <label className="image-upload-select">
            {processing ? 'در حال آماده‌سازی…' : 'انتخاب تصویر'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              disabled={processing}
              onChange={handleFile}
            />
          </label>
          {value && (
            <button type="button" className="image-upload-remove" onClick={() => {
              onChange('');
              setBrokenPreview(false);
            }}>
              حذف تصویر
            </button>
          )}
          <small>JPG، PNG یا WebP · تصویرهای بزرگ‌تر خودکار فشرده می‌شوند (حداکثر ۵ مگابایت)</small>
        </div>
      </div>
    </div>
  );
}
