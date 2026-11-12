import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { deleteRows, insertRows, readTable, updateRows } from '../offlineSync';
import { getSocialProfileUrl, normalizeSocialHandle, trimBusinessContactText } from '../businessContactUtils';
import EmptyState from './EmptyState';
import { useToast } from './useToast';
import './BusinessContactsPanel.css';

const STORAGE_BUCKET = 'business-contact-cards';
const MAX_CARD_SIZE = 5 * 1024 * 1024;
const INITIAL_FORM = {
  first_name: '',
  last_name: '',
  company_name: '',
  field_of_work: '',
  phone: '',
  instagram_id: '',
  telegram_id: '',
  business_card_path: '',
  personal_photo_path: '',
  notes: '',
};

const searchableText = (contact) => [
  contact.first_name,
  contact.last_name,
  contact.company_name,
  contact.field_of_work,
  contact.phone,
  contact.instagram_id,
  contact.telegram_id,
  contact.notes,
].join(' ').toLocaleLowerCase('fa-IR');

function safeSocialUrl(value, platform) {
  try {
    return getSocialProfileUrl(value, platform);
  } catch {
    return '';
  }
}

export default function BusinessContactsPanel({ organizationId }) {
  const { confirm, toast } = useToast();
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [editingId, setEditingId] = useState(null);
  const [cardFile, setCardFile] = useState(null);
  const [personalPhotoFile, setPersonalPhotoFile] = useState(null);
  const [editingCardUrl, setEditingCardUrl] = useState('');
  const [editingPersonalPhotoUrl, setEditingPersonalPhotoUrl] = useState('');
  const [removeCard, setRemoveCard] = useState(false);
  const [removePersonalPhoto, setRemovePersonalPhoto] = useState(false);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const dialogReturnFocusRef = useRef(null);

  const loadContacts = useCallback(async () => {
    try {
      const { data, error } = await readTable('business_contacts', {
        orderBy: 'last_name',
        ascending: true,
      });
      if (error) throw error;

      const imageErrors = [];
      const contactsWithCardUrls = await Promise.all((data || []).map(async (contact) => {
        const contactWithImages = { ...contact };
        const images = [
          { path: 'business_card_path', url: 'business_card_url', error: 'business_card_error', label: 'کارت ویزیت' },
          { path: 'personal_photo_path', url: 'personal_photo_url', error: 'personal_photo_error', label: 'عکس پرسنلی' },
        ];
        for (const image of images) {
          if (!contact[image.path]) continue;
          const { data: signedUrl, error: signedUrlError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(contact[image.path], 3600);
          if (signedUrlError || !signedUrl?.signedUrl) {
            const message = signedUrlError?.message || 'ساخت لینک امن تصویر ناموفق بود.';
            imageErrors.push(`${contact.first_name} ${contact.last_name} (${image.label}): ${message}`);
            contactWithImages[image.error] = message;
          } else {
            contactWithImages[image.url] = signedUrl.signedUrl;
          }
        }
        return contactWithImages;
      }));
      setContacts(contactsWithCardUrls);
      setErrorMessage(imageErrors.length ? `بارگذاری برخی تصاویر مخاطبان ناموفق بود: ${imageErrors.join('؛ ')}` : '');
    } catch (error) {
      setErrorMessage(`بارگذاری دفترچهٔ مخاطبان ناموفق بود: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadContacts(); }, 0);
    window.addEventListener('focus', loadContacts);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener('focus', loadContacts);
    };
  }, [loadContacts]);

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fa-IR');
    return query ? contacts.filter((contact) => searchableText(contact).includes(query)) : contacts;
  }, [contacts, search]);

  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM);
    setEditingId(null);
    setCardFile(null);
    setPersonalPhotoFile(null);
    setEditingCardUrl('');
    setEditingPersonalPhotoUrl('');
    setRemoveCard(false);
    setRemovePersonalPhoto(false);
    setFormOpen(false);
  }, []);

  useEffect(() => {
    if (!formOpen) {
      if (dialogReturnFocusRef.current instanceof HTMLElement) dialogReturnFocusRef.current.focus();
      return undefined;
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !saving) {
        event.preventDefault();
        resetForm();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [formOpen, resetForm, saving]);

  const openNewContactForm = () => {
    dialogReturnFocusRef.current = document.activeElement;
    setForm(INITIAL_FORM);
    setEditingId(null);
    setCardFile(null);
    setPersonalPhotoFile(null);
    setEditingCardUrl('');
    setEditingPersonalPhotoUrl('');
    setRemoveCard(false);
    setRemovePersonalPhoto(false);
    setFormOpen(true);
    setErrorMessage('');
  };

  const openEditContactForm = (contact) => {
    dialogReturnFocusRef.current = document.activeElement;
    setForm({
      ...INITIAL_FORM,
      ...contact,
      instagram_id: contact.instagram_id ? `@${contact.instagram_id}` : '',
      telegram_id: contact.telegram_id ? `@${contact.telegram_id}` : '',
    });
    setEditingId(contact.id);
    setCardFile(null);
    setPersonalPhotoFile(null);
    setEditingCardUrl(contact.business_card_url || '');
    setEditingPersonalPhotoUrl(contact.personal_photo_url || '');
    setRemoveCard(false);
    setRemovePersonalPhoto(false);
    setFormOpen(true);
    setErrorMessage('');
  };

  const handleImageFileChange = (event, setFile, setRemove, imageLabel) => {
    const [file] = event.target.files || [];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrorMessage(`تصویر ${imageLabel} باید با فرمت JPG، PNG یا WebP باشد.`);
      setFile(null);
      event.target.value = '';
      return;
    }
    if (file.size > MAX_CARD_SIZE) {
      setErrorMessage(`حجم تصویر ${imageLabel} نباید بیشتر از ۵ مگابایت باشد.`);
      setFile(null);
      event.target.value = '';
      return;
    }
    setErrorMessage('');
    setFile(file);
    setRemove(false);
  };

  const handleCardFileChange = (event) => {
    handleImageFileChange(event, setCardFile, setRemoveCard, 'کارت ویزیت');
  };

  const handlePersonalPhotoChange = (event) => {
    handleImageFileChange(event, setPersonalPhotoFile, setRemovePersonalPhoto, 'پرسنلی');
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const firstName = trimBusinessContactText(form.first_name);
    const lastName = trimBusinessContactText(form.last_name);
    if (!firstName || !lastName) {
      setErrorMessage('نام و نام خانوادگی را وارد کنید.');
      return;
    }

    setSaving(true);
    setErrorMessage('');
    const uploadedPaths = [];
    let contactSaved = false;
    try {
      if ((cardFile || removeCard || personalPhotoFile || removePersonalPhoto) && !navigator.onLine) {
        throw new Error('برای افزودن یا حذف تصاویر مخاطب باید به اینترنت متصل باشید.');
      }
      const instagramId = normalizeSocialHandle(form.instagram_id, 'instagram');
      const telegramId = normalizeSocialHandle(form.telegram_id, 'telegram');
      let businessCardPath = removeCard ? null : form.business_card_path || null;
      let personalPhotoPath = removePersonalPhoto ? null : form.personal_photo_path || null;

      const uploadImage = async (file) => {
        const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
        const imagePath = `${organizationId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(imagePath, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        uploadedPaths.push(imagePath);
        return imagePath;
      };

      if (cardFile) businessCardPath = await uploadImage(cardFile);
      if (personalPhotoFile) personalPhotoPath = await uploadImage(personalPhotoFile);

      const contactData = {
        first_name: firstName,
        last_name: lastName,
        company_name: trimBusinessContactText(form.company_name) || null,
        field_of_work: trimBusinessContactText(form.field_of_work) || null,
        phone: trimBusinessContactText(form.phone) || null,
        instagram_id: instagramId || null,
        telegram_id: telegramId || null,
        business_card_path: businessCardPath,
        personal_photo_path: personalPhotoPath,
        notes: trimBusinessContactText(form.notes) || null,
      };

      const result = editingId
        ? await updateRows('business_contacts', contactData, [{ column: 'id', operator: 'eq', value: editingId }])
        : await insertRows('business_contacts', [contactData]);
      if (result.error) throw result.error;
      contactSaved = true;

      const previousImagePaths = [form.business_card_path, form.personal_photo_path]
        .filter((path) => path && ![businessCardPath, personalPhotoPath].includes(path));
      let cleanupMessage = '';
      if (previousImagePaths.length) {
        const { error: removeError } = await supabase.storage.from(STORAGE_BUCKET).remove(previousImagePaths);
        if (removeError) cleanupMessage = `اطلاعات مخاطب ذخیره شد اما حذف تصویر قبلی ناموفق بود: ${removeError.message}`;
      }
      resetForm();
      await loadContacts();
      toast('success', editingId ? 'اطلاعات مخاطب ذخیره شد.' : 'مخاطب کاری ثبت شد.');
      if (cleanupMessage) setErrorMessage(cleanupMessage);
    } catch (error) {
      if (uploadedPaths.length && !contactSaved) {
        const { error: cleanupError } = await supabase.storage.from(STORAGE_BUCKET).remove(uploadedPaths);
        setErrorMessage(cleanupError
          ? `ذخیرهٔ مخاطب ناموفق بود: ${error.message}؛ پاک‌سازی تصویر بارگذاری‌شده هم ناموفق بود: ${cleanupError.message}`
          : `ذخیرهٔ مخاطب ناموفق بود: ${error.message}`);
      } else {
        setErrorMessage(`ذخیرهٔ مخاطب ناموفق بود: ${error.message}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contact) => {
    const fullName = `${contact.first_name} ${contact.last_name}`;
    if (!await confirm(`مخاطب «${fullName}» حذف شود؟`)) return;
    const imagePaths = [contact.business_card_path, contact.personal_photo_path].filter(Boolean);
    if (imagePaths.length && !navigator.onLine) {
      setErrorMessage('برای حذف مخاطبی که تصویر دارد، ابتدا به اینترنت متصل شوید.');
      return;
    }
    setErrorMessage('');
    try {
      const { error } = await deleteRows('business_contacts', [{ column: 'id', operator: 'eq', value: contact.id }]);
      if (error) throw error;
      setContacts((current) => current.filter((item) => item.id !== contact.id));
      if (imagePaths.length) {
        const { error: removeError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .remove(imagePaths);
        if (removeError) throw new Error(`مخاطب حذف شد اما حذف تصاویر او ناموفق بود: ${removeError.message}`);
      }
      toast('success', 'مخاطب کاری حذف شد.');
    } catch (error) {
      setErrorMessage(`حذف مخاطب ناموفق بود: ${error.message}`);
    }
  };

  return (
    <section className="business-contacts" dir="rtl">
      <header className="business-contacts-header">
        <div>
          <span>دفترچهٔ فضای کاری</span>
          <h2>مخاطبان کاری</h2>
          <p>اطلاعات فروشنده‌ها، تأمین‌کننده‌ها و افرادی را که با آن‌ها کار می‌کنید نگه دارید.</p>
        </div>
        <button type="button" className="business-contacts-add" onClick={openNewContactForm}>افزودن مخاطب</button>
      </header>

      {!formOpen && errorMessage && <p className="business-contacts-error" role="alert">{errorMessage}</p>}

      {formOpen && createPortal(
        <div
          className="business-contact-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) resetForm();
          }}
        >
        <form
          className="business-contact-form business-contact-modal"
          onSubmit={handleSave}
          role="dialog"
          aria-modal="true"
          aria-labelledby="business-contact-form-title"
        >
          <div className="business-contact-form-heading">
            <h3 id="business-contact-form-title">{editingId ? 'ویرایش مخاطب' : 'ثبت مخاطب جدید'}</h3>
            <button type="button" onClick={resetForm} disabled={saving} aria-label="بستن فرم">×</button>
          </div>
          <fieldset className="business-contact-fields" disabled={saving}>
            <label>نام<input autoFocus value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} maxLength={100} required /></label>
            <label>نام خانوادگی<input value={form.last_name} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} maxLength={100} required /></label>
            <label>نام مجموعه<input value={form.company_name || ''} onChange={(event) => setForm((current) => ({ ...current, company_name: event.target.value }))} maxLength={160} /></label>
            <label>حوزهٔ فعالیت<input value={form.field_of_work || ''} onChange={(event) => setForm((current) => ({ ...current, field_of_work: event.target.value }))} maxLength={160} placeholder="مثلاً گل‌فروشی، تجهیزات صوتی" /></label>
            <label>شماره تماس<input type="tel" dir="ltr" value={form.phone || ''} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} maxLength={40} /></label>
            <label>آیدی اینستاگرام<input dir="ltr" value={form.instagram_id || ''} onChange={(event) => setForm((current) => ({ ...current, instagram_id: event.target.value }))} placeholder="@username" maxLength={100} /></label>
            <label>آیدی تلگرام<input dir="ltr" value={form.telegram_id || ''} onChange={(event) => setForm((current) => ({ ...current, telegram_id: event.target.value }))} placeholder="@username" maxLength={100} /></label>
            <div className="business-contact-card-upload">
              <label htmlFor="business-contact-personal-photo-file">عکس پرسنلی</label>
              <input id="business-contact-personal-photo-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePersonalPhotoChange} />
              <small>JPG، PNG یا WebP؛ حداکثر ۵ مگابایت</small>
              {personalPhotoFile && <small>{personalPhotoFile.name}</small>}
              {!personalPhotoFile && form.personal_photo_path && !removePersonalPhoto && (
                <>
                  {editingPersonalPhotoUrl && <img className="business-contact-personal-photo-preview" src={editingPersonalPhotoUrl} alt="پیش‌نمایش عکس پرسنلی" />}
                  <button type="button" onClick={() => setRemovePersonalPhoto(true)}>حذف عکس پرسنلی</button>
                </>
              )}
              {removePersonalPhoto && <small>عکس پرسنلی پس از ذخیره حذف می‌شود.</small>}
            </div>
            <div className="business-contact-card-upload">
              <label htmlFor="business-contact-card-file">تصویر کارت ویزیت</label>
              <input id="business-contact-card-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleCardFileChange} />
              <small>JPG، PNG یا WebP؛ حداکثر ۵ مگابایت</small>
              {cardFile && <small>{cardFile.name}</small>}
              {!cardFile && editingCardUrl && !removeCard && (
                <>
                  <a href={editingCardUrl} target="_blank" rel="noreferrer">مشاهدهٔ تصویر ثبت‌شده</a>
                  <button type="button" onClick={() => setRemoveCard(true)}>حذف تصویر کارت</button>
                </>
              )}
              {removeCard && <small>تصویر کارت پس از ذخیره حذف می‌شود.</small>}
            </div>
            <label className="business-contact-notes">یادداشت<textarea value={form.notes || ''} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} maxLength={2000} rows={3} placeholder="مثلاً وسیله را از ایشان خریدم یا نحوهٔ آشنایی" /></label>
          </fieldset>
          {errorMessage && <p className="business-contacts-error" role="alert">{errorMessage}</p>}
          <div className="business-contact-form-actions">
            <button type="submit" disabled={saving}>{saving ? 'در حال ذخیره…' : editingId ? 'ذخیرهٔ تغییرات' : 'ثبت مخاطب'}</button>
            <button type="button" onClick={resetForm} disabled={saving}>انصراف</button>
          </div>
        </form>
        </div>,
        document.body,
      )}

      <div className="business-contacts-toolbar">
        <label>
          <span className="sr-only">جستجوی مخاطبان کاری</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جستجو در نام، مجموعه یا حوزهٔ فعالیت…" />
        </label>
        <span>{contacts.length} مخاطب</span>
      </div>

      {loading ? (
        <p className="business-contacts-status" role="status">در حال بارگذاری دفترچه…</p>
      ) : filteredContacts.length === 0 ? (
        <EmptyState
          icon={search ? 'search' : 'list'}
          title={search ? 'مخاطبی پیدا نشد' : 'دفترچه هنوز خالی است'}
          description={search ? 'عبارت دیگری را جستجو کنید.' : 'اطلاعات فروشنده‌ها و همکارانتان را اینجا ثبت کنید.'}
          primaryAction={!search ? { label: 'افزودن مخاطب', onClick: openNewContactForm } : undefined}
        />
      ) : (
        <div className="business-contacts-grid">
          {filteredContacts.map((contact) => {
            const fullName = `${contact.first_name} ${contact.last_name}`;
            const telegramUrl = safeSocialUrl(contact.telegram_id, 'telegram');
            const instagramUrl = safeSocialUrl(contact.instagram_id, 'instagram');
            return (
              <article className="business-contact-card" key={contact.id}>
                <div className="business-contact-card-main">
                  <span className="business-contact-avatar" aria-hidden="true">
                    {contact.personal_photo_url
                      ? <img src={contact.personal_photo_url} alt="" loading="lazy" />
                      : (contact.first_name || '?').slice(0, 1)}
                  </span>
                  <div className="business-contact-name">
                    <h3>{fullName}</h3>
                    {contact.company_name && <p>{contact.company_name}</p>}
                  </div>
                  <div className="business-contact-actions">
                    <button type="button" onClick={() => openEditContactForm(contact)} aria-label={`ویرایش ${fullName}`}>ویرایش</button>
                    <button type="button" onClick={() => handleDelete(contact)} aria-label={`حذف ${fullName}`}>حذف</button>
                  </div>
                </div>

                {(contact.field_of_work || contact.phone) && (
                  <div className="business-contact-summary">
                    {contact.field_of_work && (
                      <p className="business-contact-field">
                        <span>حوزهٔ فعالیت</span>
                        <strong>{contact.field_of_work}</strong>
                      </p>
                    )}
                    {contact.phone && (
                      <a className="business-contact-detail" href={`tel:${contact.phone}`}>
                        <span>شماره تماس</span>
                        <strong dir="ltr">{contact.phone}</strong>
                      </a>
                    )}
                  </div>
                )}
                <div className="business-contact-socials">
                  {contact.telegram_id && (telegramUrl
                    ? <a href={telegramUrl} target="_blank" rel="noreferrer">تلگرام · @{contact.telegram_id}</a>
                    : <span>تلگرام · @{contact.telegram_id}</span>)}
                  {contact.instagram_id && (instagramUrl
                    ? <a href={instagramUrl} target="_blank" rel="noreferrer">اینستاگرام · @{contact.instagram_id}</a>
                    : <span>اینستاگرام · @{contact.instagram_id}</span>)}
                </div>
                {contact.business_card_url && (
                  <a className="business-contact-card-image" href={contact.business_card_url} target="_blank" rel="noreferrer">
                    <img src={contact.business_card_url} alt={`کارت ویزیت ${fullName}`} loading="lazy" />
                    <span>مشاهدهٔ کارت ویزیت</span>
                  </a>
                )}
                {contact.business_card_error && <p className="business-contact-image-error">دریافت تصویر کارت ناموفق بود: {contact.business_card_error}</p>}
                {contact.personal_photo_error && <p className="business-contact-image-error">دریافت عکس پرسنلی ناموفق بود: {contact.personal_photo_error}</p>}
                {contact.notes && <p className="business-contact-note">{contact.notes}</p>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
