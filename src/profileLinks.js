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

export const normalizeProfileLinks = ({ website = '', instagram = '', telegram = '', rubika = '' }) => ({
  website: normalizeAddress(website, 'سایت'),
  instagram: extractSocialId(instagram, 'اینستاگرام', ['instagram.com', 'www.instagram.com']),
  telegram: extractSocialId(telegram, 'تلگرام', ['t.me', 'telegram.me', 'www.t.me']),
  rubika: extractSocialId(rubika, 'روبیکا', ['rubika.ir', 'www.rubika.ir']),
});

export const getProfileSocialLinks = (profile = {}) => {
  const links = normalizeProfileLinks({
    website: '',
    instagram: profile.instagram_id || profile.instagram || '',
    telegram: profile.telegram_id || profile.telegram || '',
    rubika: profile.rubika_id || profile.rubika || '',
  });
  return [
    ...(links.instagram ? [{ key: 'instagram', label: 'اینستاگرام', href: `https://www.instagram.com/${encodeURIComponent(links.instagram)}/` }] : []),
    ...(links.telegram ? [{ key: 'telegram', label: 'تلگرام', href: `https://t.me/${encodeURIComponent(links.telegram)}` }] : []),
    ...(links.rubika ? [{ key: 'rubika', label: 'روبیکا', href: `https://rubika.ir/${encodeURIComponent(links.rubika)}` }] : []),
  ];
};
