import test from 'node:test';
import assert from 'node:assert/strict';
import { attachCustomerPhones } from '../src/remindersUtils.js';

test('fills reminder phone from the linked customer record', () => {
  const invoices = [{ id: 1, customer_id: 12, customer_name: 'مشتری الف' }];
  const customers = [{ id: 12, 'Full name': 'مشتری الف', phone: '09120000000' }];

  assert.deepEqual(attachCustomerPhones(invoices, customers), [
    { id: 1, customer_id: 12, customer_name: 'مشتری الف', customer_phone: '09120000000' },
  ]);
});

test('matches legacy invoices by a unique normalized customer name', () => {
  const invoices = [{ id: 2, customer_name: 'علی   رضایی' }];
  const customers = [{ id: 22, 'Full name': 'علی رضایی', phone: '09121111111' }];

  assert.deepEqual(attachCustomerPhones(invoices, customers), [
    { id: 2, customer_name: 'علی   رضایی', customer_phone: '09121111111' },
  ]);
});

test('fills reminder phone from the source quotation snapshot', () => {
  const invoices = [{ id: 8, quotation_id: '17', customer_name: 'مشتری الف' }];
  const quotations = [{ id: 17, customer_phone: '09127777777' }];

  assert.deepEqual(attachCustomerPhones(invoices, [], quotations), [
    { id: 8, quotation_id: '17', customer_name: 'مشتری الف', customer_phone: '09127777777' },
  ]);
});

test('keeps invoice phone and avoids guessing between duplicate customer names', () => {
  const invoices = [
    { id: 3, customer_name: 'رضا احمدی', customer_phone: '09123333333' },
    { id: 4, customer_name: 'رضا احمدی' },
  ];
  const customers = [
    { id: 1, 'Full name': 'رضا احمدی', phone: '09124444444' },
    { id: 2, 'Full name': 'رضا احمدی', phone: '09125555555' },
  ];

  assert.deepEqual(attachCustomerPhones(invoices, customers), invoices);
});
