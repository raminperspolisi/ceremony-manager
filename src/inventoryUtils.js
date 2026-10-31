export function getInventoryQuantity(movements, inventoryId, warehouseId) {
  return movements
    .filter((movement) => String(movement.inventory_id) === String(inventoryId)
      && String(movement.warehouse_id) === String(warehouseId))
    .reduce((total, movement) => total + Number(movement.quantity_delta || 0), 0);
}

export function getInventoryAdjustment(currentQuantity, targetQuantity) {
  return Number((Number(targetQuantity) - Number(currentQuantity)).toFixed(3));
}

export function getReservedQuantity(reservations, inventoryId, warehouseId) {
  const active = reservations.filter((reservation) => (
    String(reservation.inventory_id) === String(inventoryId)
    && String(reservation.warehouse_id) === String(warehouseId)
    && reservation.status === 'reserved'
  ));
  const saleQuantity = active
    .filter((reservation) => reservation.reservation_type === 'sale')
    .reduce((total, reservation) => total + Number(reservation.quantity || 0), 0);
  const rentEvents = new Map();
  for (const reservation of active) {
    if (reservation.reservation_type !== 'rent' || !reservation.starts_on || !reservation.ends_on) continue;
    const start = Date.parse(`${reservation.starts_on}T00:00:00Z`);
    const dayAfterEnd = Date.parse(`${reservation.ends_on}T00:00:00Z`) + 86400000;
    const quantity = Number(reservation.quantity || 0);
    rentEvents.set(start, (rentEvents.get(start) || 0) + quantity);
    rentEvents.set(dayAfterEnd, (rentEvents.get(dayAfterEnd) || 0) - quantity);
  }

  let concurrentRentQuantity = 0;
  let maximumRentQuantity = 0;
  for (const [, change] of [...rentEvents].sort(([first], [second]) => first - second)) {
    concurrentRentQuantity += change;
    maximumRentQuantity = Math.max(maximumRentQuantity, concurrentRentQuantity);
  }
  return saleQuantity + maximumRentQuantity;
}

export function isBelowMinimumStock(item, quantity) {
  const minimumStock = Number(item.minimum_stock || 0);
  return minimumStock > 0 && quantity <= minimumStock;
}
