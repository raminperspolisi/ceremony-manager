const PLATFORM_HOSTS = {
  instagram: ['instagram.com', 'www.instagram.com'],
  telegram: ['t.me', 'telegram.me', 'www.t.me'],
};

export function normalizeSocialHandle(value, platform) {
  const input = String(value ?? '').trim();
  if (!input) return '';
  const hosts = PLATFORM_HOSTS[platform];
  if (!hosts) throw new Error('شبکهٔ اجتماعی پشتیبانی نمی‌شود.');

  let handle = input;
  if (/^(?:https?:\/\/|www\.|(?:t\.me|telegram\.me|instagram\.com)\/)/i.test(input)) {
    let url;
    try {
      url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`);
    } catch {
      throw new Error(`لینک ${platform === 'telegram' ? 'تلگرام' : 'اینستاگرام'} معتبر نیست.`);
    }
    if (!hosts.includes(url.hostname.toLowerCase())) {
      throw new Error(`لینک ${platform === 'telegram' ? 'تلگرام' : 'اینستاگرام'} باید از دامنهٔ رسمی همان سرویس باشد.`);
    }
    handle = url.pathname.split('/').filter(Boolean)[0] || '';
  }

  handle = handle.replace(/^@/, '').trim();
  const isValid = platform === 'telegram'
    ? /^[A-Za-z0-9_]{5,32}$/.test(handle)
    : /^[A-Za-z0-9._]{1,30}$/.test(handle) && !/[.]$/.test(handle);
  if (!isValid) throw new Error(`شناسهٔ ${platform === 'telegram' ? 'تلگرام' : 'اینستاگرام'} معتبر نیست.`);
  return handle;
}

export function getSocialProfileUrl(value, platform) {
  const handle = normalizeSocialHandle(value, platform);
  if (!handle) return '';
  return platform === 'telegram'
    ? `https://t.me/${encodeURIComponent(handle)}`
    : `https://www.instagram.com/${encodeURIComponent(handle)}/`;
}
