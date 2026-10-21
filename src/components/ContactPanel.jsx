import React from 'react';

const contacts = [
  {
    label: 'تماس تلفنی',
    value: '۰۹۱۲۳۴۱۸۱۴۹',
    href: 'tel:+989123418149',
    icon: '☎️'
  },
  {
    label: 'واتساپ',
    value: '۰۹۱۲۳۴۱۸۱۴۹',
    href: 'https://wa.me/989123418149',
    icon: '💬'
  },
  {
    label: 'اینستاگرام',
    value: '@ramin.perspolisi',
    href: 'https://instagram.com/ramin.perspolisi',
    icon: '📷'
  },
  {
    label: 'تلگرام',
    value: '@raminperspolisi8',
    href: 'https://t.me/raminperspolisi8',
    icon: '✈️'
  },
  {
    label: 'ایمیل',
    value: 'aliheydariramin@gmail.com',
    href: 'mailto:aliheydariramin@gmail.com',
    icon: '✉️'
  }
];

export default function ContactPanel() {
  return (
    <section style={{ background: '#fff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', direction: 'rtl' }}>
      <header style={{ marginBottom: '18px' }}>
        <h2 style={{ margin: '0 0 6px', color: '#0f172a', fontSize: '20px' }}>ارتباط با ما</h2>
        <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>برای پرسش، راهنمایی یا پیگیری از یکی از راه‌های زیر با ما در تماس باشید.</p>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        {contacts.map((contact) => (
          <a
            key={contact.label}
            href={contact.href}
            target={contact.href.startsWith('http') ? '_blank' : undefined}
            rel={contact.href.startsWith('http') ? 'noreferrer' : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', color: '#0f172a', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', textDecoration: 'none' }}
          >
            <span aria-hidden="true" style={{ fontSize: '22px' }}>{contact.icon}</span>
            <span style={{ display: 'grid', gap: '3px', minWidth: 0 }}>
              <strong style={{ color: '#0369a1', fontSize: '13px' }}>{contact.label}</strong>
              <span dir="auto" style={{ color: '#475569', fontSize: '12px', overflowWrap: 'anywhere' }}>{contact.value}</span>
            </span>
          </a>
        ))}
      </div>
      <div style={{ marginTop: '16px', padding: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', color: '#166534', fontSize: '13px' }}>
        <strong>آدرس:</strong> ابهر، میدان آسیاب
      </div>
    </section>
  );
}
