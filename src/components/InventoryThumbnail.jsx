import { useEffect, useRef, useState } from 'react';
import { readTable } from '../offlineSync';
import { getInventoryImage } from '../inventoryImage';

export default function InventoryThumbnail({ item, className = '', onImageLoaded }) {
  const [image, setImage] = useState(() => getInventoryImage(item));
  const [status, setStatus] = useState(() => (
    item?.id && item.image === undefined ? 'idle' : 'complete'
  ));
  const [failed, setFailed] = useState(false);
  const placeholderRef = useRef(null);
  const onImageLoadedRef = useRef(onImageLoaded);
  onImageLoadedRef.current = onImageLoaded;

  useEffect(() => {
    setImage(getInventoryImage(item));
    setStatus(item?.id && item.image === undefined ? 'idle' : 'complete');
    setFailed(false);
  }, [item?.id, item?.image]);

  useEffect(() => {
    if (!item?.id || item.image !== undefined) return undefined;
    let cancelled = false;
    let observer;

    const loadImage = async () => {
      setStatus('loading');
      const { data, error } = await readTable('inventory', {
        columns: 'id, image',
        filters: [{ column: 'id', operator: 'eq', value: item.id }],
        limit: 1,
      });
      if (cancelled) return;
      if (error) {
        console.error(`دریافت تصویر کالای ${item.id} ناموفق بود:`, error.message);
        setStatus('failed');
        return;
      }

      const loadedImage = getInventoryImage(data?.[0]);
      if (loadedImage) {
        setImage(loadedImage);
        onImageLoadedRef.current?.({ ...item, image: loadedImage });
      }
      setStatus('complete');
    };

    const placeholder = placeholderRef.current;
    if (!placeholder || typeof window.IntersectionObserver !== 'function') {
      void loadImage();
      return () => {
        cancelled = true;
      };
    }

    observer = new window.IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        void loadImage();
      }
    });
    observer.observe(placeholder);

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [item?.id, item?.image]);

  if (image && !failed) {
    return (
      <img
        className={`inventory-thumbnail ${className}`}
        src={image}
        alt={`تصویر ${item?.title || 'کالا'}`}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  if (status === 'idle' || status === 'loading') {
    return (
      <span ref={placeholderRef} className={`inventory-thumbnail ${className}`} aria-hidden="true">
        {item?.title?.trim()?.slice(0, 1) || ''}
      </span>
    );
  }
  return null;
}
