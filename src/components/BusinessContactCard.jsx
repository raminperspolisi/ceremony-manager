import React from 'react';

export default function BusinessContactCard({
  businessName,
  contact = { website: '', email: '', socialLinks: [] },
  onEdit,
}) {
  const hasContact = Boolean(contact.website || contact.email || contact.socialLinks.length);

  return (
    <section className="business-contact-card" aria-label="راه‌های ارتباطی مجموعه">
      <div className="business-contact-card-heading">
        <div>
          <span>ارتباط با مجموعه</span>
          <h4>{businessName}</h4>
        </div>
        <button type="button" onClick={onEdit}>
          {hasContact ? 'ویرایش اطلاعات' : 'افزودن اطلاعات تماس'}
        </button>
      </div>
      {hasContact ? (
        <div className="business-contact-card-links">
          {contact.website && (
            <a href={contact.website} target="_blank" rel="noopener noreferrer">
              <span aria-hidden="true">↗</span>
              <span><strong>وب‌سایت</strong><small>{contact.website.replace(/^https:\/\//, '').replace(/\/$/, '')}</small></span>
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${encodeURIComponent(contact.email)}`}>
              <span aria-hidden="true">@</span>
              <span><strong>ایمیل مجموعه</strong><small>{contact.email}</small></span>
            </a>
          )}
          {contact.socialLinks.map((link) => (
            <a key={link.key} href={link.href} target="_blank" rel="noopener noreferrer">
              <span aria-hidden="true">{link.key === 'instagram' ? '◎' : link.key === 'telegram' ? '➤' : '◉'}</span>
              <span><strong>{link.label}</strong><small>{link.href.replace(/^https:\/\//, '')}</small></span>
            </a>
          ))}
        </div>
      ) : (
        <p className="business-contact-card-empty">اطلاعات تماس مجموعه را ثبت کنید تا اینجا و روی فاکتورها نمایش داده شود.</p>
      )}
    </section>
  );
}
