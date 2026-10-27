import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const SECTIONS = [
  ['dashboard', 'داشبورد'],
  ['customers', 'مشتریان'],
  ['inventory', 'انبار و کالاها'],
  ['quotations', 'پیش‌فاکتور'],
  ['official', 'فاکتور رسمی'],
  ['bot_orders', 'سفارش‌های ربات'],
  ['accounting', 'صندوق، بانک و گزارش مالی'],
  ['calendar', 'تقویم و یادآورها'],
  ['backup', 'پشتیبان‌گیری'],
  ['tutorial', 'آموزش نرم‌افزار'],
  ['contact', 'ارتباط با ما'],
];

const DEFAULT_PERMISSIONS = {
  dashboard: true,
  customers: true,
  inventory: true,
  quotations: true,
  official: true,
  bot_orders: false,
  accounting: false,
  calendar: true,
  backup: false,
  tutorial: true,
  contact: true,
};

const permissionValues = (value = {}) => Object.fromEntries(
  SECTIONS.map(([key]) => [key, Boolean(value[key])]),
);

export default function OrganizationManagementPanel({
  organization,
  membership,
  onOrganizationCreated,
  onMembershipChanged,
}) {
  const [organizationName, setOrganizationName] = useState(organization?.name || '');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [feedback, setFeedback] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [invitePermissions, setInvitePermissions] = useState(DEFAULT_PERMISSIONS);
  const [members, setMembers] = useState([]);
  const isAdmin = membership?.role === 'owner' || membership?.role === 'admin';

  useEffect(() => {
    let active = true;
    if (organization?.id && isAdmin) {
      const loadMembers = async () => {
        try {
          const { data, error } = await supabase
            .from('organization_memberships')
            .select('user_id,email,role,section_permissions,created_at')
            .eq('organization_id', organization.id)
            .order('created_at', { ascending: true });
          if (!active) return;
          if (error) throw error;
          setErrorMessage('');
          setMembers(data || []);
        } catch (error) {
          if (active) setErrorMessage(`دریافت اعضای فضای کاری ناموفق بود: ${error.message}`);
        }
      };
      void loadMembers();
    }

    return () => { active = false; };
  }, [organization?.id, isAdmin]);

  const createOrganization = async (event) => {
    event.preventDefault();
    setBusy(true);
    setErrorMessage('');
    setFeedback('');
    try {
      const { data, error } = await supabase.rpc('create_organization', {
        p_name: organizationName.trim(),
      });
      if (error) throw error;
      const createdOrganization = Array.isArray(data) ? data[0] : data;
      if (!createdOrganization?.id) throw new Error('پاسخ ساخت فضای کاری از سرور معتبر نیست.');
      await onOrganizationCreated(createdOrganization);
    } catch (error) {
      setErrorMessage(`ساخت فضای کاری ناموفق بود: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const saveOrganizationName = async (event) => {
    event.preventDefault();
    setBusy(true);
    setErrorMessage('');
    setFeedback('');
    try {
      const { error } = await supabase.rpc('update_organization_name', {
        p_organization_id: organization.id,
        p_name: organizationName.trim(),
      });
      if (error) throw error;
      setFeedback('نام فضای کاری ذخیره شد.');
      await onMembershipChanged();
    } catch (error) {
      setErrorMessage(`ذخیرهٔ نام فضای کاری ناموفق بود: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const inviteMember = async (event) => {
    event.preventDefault();
    setBusy(true);
    setErrorMessage('');
    setFeedback('');
    try {
      const { data, error } = await supabase.functions.invoke('invite-organization-member', {
        body: {
          organization_id: organization.id,
          email: inviteEmail.trim(),
          role: inviteRole,
          section_permissions: permissionValues(invitePermissions),
        },
      });
      if (error) throw error;
      setInviteEmail('');
      setInviteRole('member');
      setInvitePermissions(DEFAULT_PERMISSIONS);
      setFeedback(data?.existing_user_added
        ? 'کاربر موجود به فضای کاری اضافه شد و دسترسی‌ها اعمال شد.'
        : 'دعوت‌نامه ارسال شد. پس از تأیید ایمیل، کاربر به این فضا اضافه می‌شود.');
      await onMembershipChanged();
    } catch (error) {
      setErrorMessage(`دعوت کاربر ناموفق بود: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const saveMemberPermissions = async (member, permissions) => {
    setBusy(true);
    setErrorMessage('');
    setFeedback('');
    try {
      const { error } = await supabase.rpc('update_member_section_permissions', {
        p_organization_id: organization.id,
        p_user_id: member.user_id,
        p_section_permissions: permissionValues(permissions),
      });
      if (error) throw error;
      setMembers((current) => current.map((item) => (
        item.user_id === member.user_id
          ? { ...item, section_permissions: permissionValues(permissions) }
          : item
      )));
      setFeedback('دسترسی‌های کاربر ذخیره شد.');
    } catch (error) {
      setErrorMessage(`ذخیرهٔ دسترسی‌ها ناموفق بود: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (member) => {
    if (!window.confirm(`دسترسی ${member.email || 'این کاربر'} از این فضای کاری حذف شود؟`)) return;
    setBusy(true);
    setErrorMessage('');
    setFeedback('');
    try {
      const { error } = await supabase.rpc('remove_organization_member', {
        p_organization_id: organization.id,
        p_user_id: member.user_id,
      });
      if (error) throw error;
      setMembers((current) => current.filter((item) => item.user_id !== member.user_id));
      setFeedback('دسترسی کاربر حذف شد.');
    } catch (error) {
      setErrorMessage(`حذف دسترسی کاربر ناموفق بود: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const changeMemberRole = async (member, role) => {
    setBusy(true);
    setErrorMessage('');
    setFeedback('');
    try {
      const { error } = await supabase.rpc('set_organization_member_role', {
        p_organization_id: organization.id,
        p_user_id: member.user_id,
        p_role: role,
      });
      if (error) throw error;
      setMembers((current) => current.map((item) => (
        item.user_id === member.user_id
          ? {
            ...item,
            role,
            section_permissions: role === 'admin' ? {} : item.section_permissions,
          }
          : item
      )));
      setFeedback(role === 'admin' ? 'کاربر به مدیر سازمان ارتقا یافت.' : 'دسترسی مدیر از کاربر برداشته شد.');
    } catch (error) {
      setErrorMessage(`تغییر نقش کاربر ناموفق بود: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  if (!organization) {
    return (
      <section className="organization-management" dir="rtl">
        <h3>ساخت فضای کاری</h3>
        <p>برای شروع، فضای کاری کسب‌وکار خود را بسازید. اطلاعات و اعضای هر فضا از فضاهای دیگر جدا هستند.</p>
        <form onSubmit={createOrganization}>
          <label htmlFor="new-organization-name">نام کسب‌وکار</label>
          <input
            id="new-organization-name"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            maxLength={120}
            required
            disabled={busy}
          />
          <button type="submit" disabled={busy || !organizationName.trim()}>
            {busy ? 'در حال ساخت…' : 'ساخت فضای کاری'}
          </button>
        </form>
        {errorMessage && <p role="alert">{errorMessage}</p>}
      </section>
    );
  }

  return (
    <section className="organization-management" dir="rtl">
      <h3>مدیریت فضای کاری و اعضا</h3>
      <p>دسترسی‌ها در سطح بخش تنظیم می‌شوند. امنیت داده‌ها علاوه بر این صفحه، در Supabase RLS اعمال می‌شود.</p>

      {membership?.role === 'owner' && organization.is_initial && (
        <p role="status">این فضای کاری شامل داده‌های قبلی سامانه و محدودهٔ فعال ربات تلگرام است.</p>
      )}

      {isAdmin && (
        <form onSubmit={saveOrganizationName}>
          <label htmlFor="organization-name">نام فضای کاری</label>
          <input
            id="organization-name"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            maxLength={120}
            required
            disabled={busy}
          />
          <button type="submit" disabled={busy || !organizationName.trim()}>
            ذخیرهٔ نام
          </button>
        </form>
      )}

      {isAdmin && (
        <>
          <h4>دعوت کاربر</h4>
          <p>برای حفظ امنیت، ارسال دعوت‌نامه از Edge Function سمت سرور انجام می‌شود؛ کلید Service Role در مرورگر قرار نمی‌گیرد.</p>
          <form onSubmit={inviteMember}>
            <label htmlFor="organization-invite-email">ایمیل کاربر</label>
            <input
              id="organization-invite-email"
              type="email"
              autoComplete="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              required
              disabled={busy}
            />
            {membership.role === 'owner' && (
              <label>
                نقش
                <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} disabled={busy}>
                  <option value="member">کاربر با دسترسی‌های انتخابی</option>
                  <option value="admin">مدیر سازمان با دسترسی کامل</option>
                </select>
              </label>
            )}
            {inviteRole === 'member' && <fieldset disabled={busy}>
              <legend>بخش‌های مجاز</legend>
              {SECTIONS.map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={Boolean(invitePermissions[key])}
                    onChange={(event) => setInvitePermissions((current) => ({
                      ...current,
                      [key]: event.target.checked,
                    }))}
                  />
                  {label}
                </label>
              ))}
            </fieldset>}
            <button type="submit" disabled={busy || !inviteEmail.trim()}>
              ارسال دعوت‌نامه
            </button>
          </form>

          <h4>اعضای فضای کاری</h4>
          {members.map((member) => (
            <article key={member.user_id} className="organization-member">
              <header>
                <strong>{member.email || member.user_id}</strong>
                <span>{member.role === 'owner' ? 'مالک' : member.role === 'admin' ? 'مدیر' : 'کاربر'}</span>
              </header>
              {member.role === 'member' && (
                <>
                  <div className="organization-member-permissions">
                    {SECTIONS.map(([key, label]) => (
                      <label key={key}>
                        <input
                          type="checkbox"
                          checked={Boolean(member.section_permissions?.[key])}
                          disabled={busy}
                          onChange={(event) => {
                            const nextPermissions = {
                              ...permissionValues(member.section_permissions),
                              [key]: event.target.checked,
                            };
                            setMembers((current) => current.map((item) => (
                              item.user_id === member.user_id
                                ? { ...item, section_permissions: nextPermissions }
                                : item
                            )));
                          }}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => saveMemberPermissions(member, member.section_permissions)}
                    >
                      ذخیرهٔ دسترسی‌ها
                    </button>
                    <button type="button" disabled={busy} onClick={() => removeMember(member)}>
                      حذف دسترسی
                    </button>
                  </div>
                </>
              )}
              {member.role === 'admin' && membership.role === 'owner' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => changeMemberRole(member, 'member')}
                >
                  تبدیل به کاربر عادی
                </button>
              )}
              {member.role === 'member' && membership.role === 'owner' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => changeMemberRole(member, 'admin')}
                >
                  ارتقا به مدیر سازمان
                </button>
              )}
            </article>
          ))}
          {members.length === 0 && <p>هنوز عضوی در این فضای کاری نیست.</p>}
        </>
      )}

      {errorMessage && <p role="alert">{errorMessage}</p>}
      {feedback && <p role="status">{feedback}</p>}
    </section>
  );
}
