import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getInventoryAdjustment,
  getInventoryQuantity,
  getReservedQuantity,
  isBelowMinimumStock,
} from '../src/inventoryUtils.js';

test('calculates the signed adjustment needed to reach a target stock count', () => {
  assert.equal(getInventoryAdjustment(4.5, 7), 2.5);
  assert.equal(getInventoryAdjustment(8, 3.125), -4.875);
  assert.equal(getInventoryAdjustment(2.111, 2.222), 0.111);
});

test('inventory quantity is isolated by item and warehouse', () => {
  const movements = [
    { inventory_id: 1, warehouse_id: 10, quantity_delta: 8 },
    { inventory_id: 1, warehouse_id: 10, quantity_delta: -3 },
    { inventory_id: 1, warehouse_id: 11, quantity_delta: 5 },
    { inventory_id: 2, warehouse_id: 10, quantity_delta: 7 },
  ];

  assert.equal(getInventoryQuantity(movements, 1, 10), 5);
  assert.equal(getInventoryQuantity(movements, 1, 11), 5);
});

test('reserved quantity adds sales to peak overlapping rent demand only', () => {
  const reservations = [
    { inventory_id: 1, warehouse_id: 10, reservation_type: 'sale', quantity: 1, status: 'reserved' },
    { inventory_id: 1, warehouse_id: 10, reservation_type: 'rent', quantity: 2, starts_on: '2026-11-01', ends_on: '2026-11-03', status: 'reserved' },
    { inventory_id: 1, warehouse_id: 10, reservation_type: 'rent', quantity: 3, starts_on: '2026-11-03', ends_on: '2026-11-05', status: 'reserved' },
    { inventory_id: 1, warehouse_id: 10, reservation_type: 'rent', quantity: 4, starts_on: '2026-11-06', ends_on: '2026-11-07', status: 'reserved' },
    { inventory_id: 1, warehouse_id: 10, reservation_type: 'rent', quantity: 50, starts_on: '2026-11-01', ends_on: '2026-11-07', status: 'cancelled' },
    { inventory_id: 1, warehouse_id: 11, reservation_type: 'sale', quantity: 20, status: 'reserved' },
  ];

  assert.equal(getReservedQuantity(reservations, 1, 10), 6);
});

test('low stock alerts require a configured threshold and include the threshold boundary', () => {
  assert.equal(isBelowMinimumStock({ minimum_stock: 3 }, 3), true);
  assert.equal(isBelowMinimumStock({ minimum_stock: 3 }, 4), false);
  assert.equal(isBelowMinimumStock({ minimum_stock: 0 }, 0), false);
});
