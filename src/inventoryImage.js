export function getInventoryImage(item) {
  return typeof item?.image === 'string' && item.image.trim() ? item.image : '';
}
