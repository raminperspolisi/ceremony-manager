import { useState } from 'react';
import { getInventoryImage } from '../inventoryImage';

export default function InventoryThumbnail({ item, className = '' }) {
  const [failed, setFailed] = useState(false);
  const image = getInventoryImage(item);
  if (!image || failed) return null;
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
