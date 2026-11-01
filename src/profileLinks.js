const normalizeAddress = (value, label) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error(`آدرس ${label} معتبر نیست.`);
  }

  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new Error(`آدرس ${label} باید یک نشانی امن با https باشد.`);
  }
  return url.href;
};

const normalizeBusinessEmail = (value) => {
  const email = String(value ?? '').trim();
  if (!email) return '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('ایمیل مجموعه معتبر نیست.');
  }
  return email;
};

const extractSocialId = (value, label, hosts) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';

  let id = trimmed;
  if (/^(?:https?:\/\/|www\.|(?:t\.me|telegram\.me|rubika\.ir|www\.instagram\.com|instagram\.com)\/)/i.test(trimmed)) {
    let url;
    try {
      url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    } catch {
      throw new Error(`شناسه یا لینک ${label} معتبر نیست.`);
    }
    if (!hosts.includes(url.hostname.toLowerCase())) {
      throw new Error(`لینک ${label} باید از دامنهٔ رسمی همان سرویس باشد.`);
    }
    const pathSegments = url.pathname.split('/').filter(Boolean);
    id = pathSegments[pathSegments.length - 1] || '';
  }

  id = id.replace(/^@/, '').trim();
  if (!/^[A-Za-z0-9._+-]{1,64}$/.test(id)) {
    throw new Error(`شناسهٔ ${label} معتبر نیست.`);
  }
  return id;
};

export const normalizeProfileLinks = ({ website = '', email = '', instagram = '', telegram = '', rubika = '' }) => ({
  website: normalizeAddress(website, 'سایت'),
  email: normalizeBusinessEmail(email),
  instagram: extractSocialId(instagram, 'اینستاگرام', ['instagram.com', 'www.instagram.com']),
  telegram: extractSocialId(telegram, 'تلگرام', ['t.me', 'telegram.me', 'www.t.me']),
  rubika: extractSocialId(rubika, 'روبیکا', ['rubika.ir', 'www.rubika.ir']),
});

export const getProfileSocialLinks = (profile = {}) => {
  const normalizeSocial = (value, label, hosts) => {
    try {
      return extractSocialId(value, label, hosts);
    } catch {
      return '';
    }
  };
  const instagram = normalizeSocial(profile.instagram_id || profile.instagram, 'اینستاگرام', ['instagram.com', 'www.instagram.com']);
  const telegram = normalizeSocial(profile.telegram_id || profile.telegram, 'تلگرام', ['t.me', 'telegram.me', 'www.t.me']);
  const rubika = normalizeSocial(profile.rubika_id || profile.rubika, 'روبیکا', ['rubika.ir', 'www.rubika.ir']);
  return [
    ...(instagram ? [{ key: 'instagram', label: 'اینستاگرام', href: `https://www.instagram.com/${encodeURIComponent(instagram)}/` }] : []),
    ...(telegram ? [{ key: 'telegram', label: 'تلگرام', href: `https://t.me/${encodeURIComponent(telegram)}` }] : []),
    ...(rubika ? [{ key: 'rubika', label: 'روبیکا', href: `https://rubika.ir/${encodeURIComponent(rubika)}` }] : []),
  ];
};

export const getBusinessContact = (profile = {}) => {
  let website = '';
  let email = '';
  try {
    website = normalizeAddress(profile.business_website, 'سایت');
  } catch {
    website = '';
  }
  try {
    email = normalizeBusinessEmail(profile.business_email);
  } catch {
    email = '';
  }
  return {
    website,
    email,
    socialLinks: getProfileSocialLinks(profile),
  };
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

export const renderBusinessContactHtml = (contact = {}) => {
  const entries = [];
  try {
    const website = normalizeAddress(contact.website, 'سایت');
    if (website) entries.push({
      label: 'وب‌سایت',
      href: website,
      text: website.replace(/^https:\/\//, '').replace(/\/$/, ''),
    });
  } catch {
    // Omit invalid legacy contact data from printed documents.
  }
  try {
    const email = normalizeBusinessEmail(contact.email);
    if (email) entries.push({ label: 'ایمیل', href: `mailto:${encodeURIComponent(email)}`, text: email });
  } catch {
    // Omit invalid legacy contact data from printed documents.
  }
  const socialHosts = {
    instagram: ['instagram.com', 'www.instagram.com'],
    telegram: ['t.me', 'telegram.me', 'www.t.me'],
    rubika: ['rubika.ir', 'www.rubika.ir'],
  };
  for (const link of contact.socialLinks || []) {
    const hosts = socialHosts[link.key];
    if (!hosts) continue;
    try {
      const handle = extractSocialId(link.href, link.label, hosts);
      const href = link.key === 'instagram'
        ? `https://www.instagram.com/${encodeURIComponent(handle)}/`
        : link.key === 'telegram'
          ? `https://t.me/${encodeURIComponent(handle)}`
          : `https://rubika.ir/${encodeURIComponent(handle)}`;
      entries.push({ label: link.label, href, text: `@${handle}` });
    } catch {
      // Omit invalid legacy contact data from printed documents.
    }
  }
  if (!entries.length) return '';
  return `<div class="business-contact"><strong>راه‌های ارتباطی مجموعه:</strong>${entries.map((entry) => (
    `<a href="${escapeHtml(entry.href)}">${escapeHtml(entry.label)}: ${escapeHtml(entry.text || entry.label)}</a>`
  )).join('')}</div>`;
};
