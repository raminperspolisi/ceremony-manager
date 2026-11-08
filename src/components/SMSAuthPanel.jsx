import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { normalizeIranianMobile, normalizeOtp } from '../authUtils';
import './SMSAuthPanel.css';

const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
const toPersianDigits = (value) =>
  String(value ?? '').replace(/\d/g, (digit) => persianDigits[Number(digit)]);

export default function SMSAuthPanel({
  isSignUp = false,
  onSignInToggle,
  onAuthenticated,
  email,
  setEmail,
  password,
  setPassword,
  authLoading = false,
  authError: emailAuthError = '',
  authMessage: emailAuthMessage = '',
  onEmailSignIn,
  onEmailSignUp,
  onClearAuthMessages,
  className = '',
}) {
  const [phone, setPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [pendingPhone, setPendingPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [useEmailAuth, setUseEmailAuth] = useState(false);

  const resendTimerRef = useRef(null);

  const clearAuthMessages = useCallback(() => {
    setAuthError('');
    setAuthMessage('');
  }, []);

  const clearResendTimer = useCallback(() => {
    if (resendTimerRef.current) {
      clearInterval(resendTimerRef.current);
      resendTimerRef.current = null;
    }
    setResendSeconds(0);
  }, []);

  useEffect(() => {
    return () => clearResendTimer();
  }, [clearResendTimer]);

  const handleRequestPhoneOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAuthError('');
    setAuthMessage('');

    try {
      const normalizedPhone = normalizeIranianMobile(phone);
      const metadata = isSignUp && contactEmail.trim()
        ? { contact_email: contactEmail.trim().toLowerCase() }
        : undefined;

      const { error } = await supabase.auth.signInWithOtp({
        phone: normalizedPhone,
        options: {
          shouldCreateUser: isSignUp,
          ...(metadata ? { data: metadata } : {}),
        },
      });
      if (error) throw error;

      setPendingPhone(normalizedPhone);
      setOtpCode('');
      setOtpSent(true);
      setAuthMessage(
        'کد تأیید پیامکی ارسال شد. لطفاً کد را وارد کنید تا وارد برنامه شوید.',
      );
      startResendTimer();
    } catch (error) {
      setAuthError('ارسال کد تأیید ناموفق بود: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAuthError('');
    setAuthMessage('');

    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: pendingPhone,
        token: normalizeOtp(otpCode),
        type: 'sms',
      });
      if (error) throw error;

      setOtpSent(false);
      setOtpCode('');
      setPhone('');
      setContactEmail('');
      clearResendTimer();

      if (onAuthenticated) {
        onAuthenticated();
      } else {
        setAuthMessage('با موفقیت وارد سیستم شدید.');
      }
    } catch (error) {
      setAuthError('کد تأیید معتبر نیست یا منقضی شده است: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!pendingPhone) return;
    setPhone(pendingPhone);
    setLoading(true);
    setAuthError('');
    setAuthMessage('');

    try {
      const metadata = isSignUp && contactEmail.trim()
        ? { contact_email: contactEmail.trim().toLowerCase() }
        : undefined;

      const { error } = await supabase.auth.signInWithOtp({
        phone: pendingPhone,
        options: {
          shouldCreateUser: isSignUp,
          ...(metadata ? { data: metadata } : {}),
        },
      });
      if (error) throw error;

      setOtpCode('');
      setAuthMessage('کد تأیید جدیدی ارسال شد.');
      startResendTimer();
    } catch (error) {
      setAuthError('ارسال دوباره کد ناموفق بود: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchMode = () => {
    setOtpSent(false);
    setOtpCode('');
    setPhone('');
    setContactEmail('');
    setPendingPhone('');
    clearResendTimer();
    clearAuthMessages();
    onSignInToggle();
  };

  const handleSwitchToEmail = () => {
    setOtpSent(false);
    setOtpCode('');
    setPhone('');
    setContactEmail('');
    setPendingPhone('');
    setUseEmailAuth(true);
    clearResendTimer();
    clearAuthMessages();
    onClearAuthMessages?.();
  };

  const handleSwitchToPhone = () => {
    setUseEmailAuth(false);
    setPassword('');
    clearAuthMessages();
    onClearAuthMessages?.();
  };

  const startResendTimer = useCallback(() => {
    clearResendTimer();
    setResendSeconds(60);
    resendTimerRef.current = setInterval(() => {
      setResendSeconds((prev) => {
        if (prev <= 1) {
          clearResendTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearResendTimer]);

  const resendDisabled = resendSeconds > 0 || loading || !otpSent;

  const title = useEmailAuth
    ? isSignUp ? 'ساخت حساب کاربری با ایمیل' : 'ورود با ایمیل'
    : isSignUp ? 'ساخت حساب کاربری با موبایل' : 'ورود با شماره موبایل';

  const description = useEmailAuth
    ? isSignUp
      ? 'برای ساخت حساب، ایمیل و یک گذرواژه وارد کنید.'
      : 'با ایمیل و گذرواژهٔ حساب خود وارد شوید.'
    : otpSent
      ? 'کد یک‌بارمصرف به شماره موبایل شما پیامک شده است.'
      : isSignUp
        ? 'شماره موبایل را وارد کنید؛ ایمیل اختیاری است.'
        : 'برای ورود، کد یک‌بارمصرف به شماره موبایل تأییدشدهٔ شما پیامک می‌شود.';

  return (
    <main className="sms-auth-screen">
      <section className={`sms-auth-panel ${className}`}>
        <div className="sms-auth-content">
          <div className="sms-auth-mobile-brand">
            <img src="/azho-logo.png" alt="لوگوی آژو مراسم" />
            <span>آژو</span>
          </div>
          <div className="sms-auth-heading">
            <span className="sms-auth-eyebrow">{isSignUp ? 'به خانواده آژو بپیوندید' : 'خوش آمدید'}</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>

          {(useEmailAuth ? emailAuthError : authError) && (
            <div className="sms-auth-message sms-auth-error" role="alert">
              {useEmailAuth ? emailAuthError : authError}
            </div>
          )}
          {(useEmailAuth ? emailAuthMessage : authMessage) && (
            <div className="sms-auth-message sms-auth-success" role="status">
              {useEmailAuth ? emailAuthMessage : authMessage}
            </div>
          )}

          {useEmailAuth ? (
            <form
              className="sms-auth-form"
              onSubmit={isSignUp ? onEmailSignUp : onEmailSignIn}
            >
              <label htmlFor="email-auth-email">ایمیل</label>
              <input
                id="email-auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                disabled={authLoading}
                onChange={(e) => setEmail(e.target.value)}
              />
              <label htmlFor="email-auth-password">گذرواژه</label>
              <input
                id="email-auth-password"
                type="password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                minLength={6}
                required
                value={password}
                disabled={authLoading}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button className="sms-auth-primary" type="submit" disabled={authLoading}>
                {authLoading ? 'لطفاً صبر کنید…' : isSignUp ? 'ثبت‌نام با ایمیل' : 'ورود با ایمیل'}
                <span aria-hidden="true">←</span>
              </button>
            </form>
          ) : (
            <form
              className="sms-auth-form"
              onSubmit={otpSent ? handleVerifyPhoneOtp : handleRequestPhoneOtp}
            >
              {!otpSent && (
                <>
                  <label htmlFor="sms-auth-phone">شماره موبایل</label>
                  <input
                    id="sms-auth-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="مثلاً ۰۹۱۲۱۲۳۴۵۶۷"
                    required
                    value={phone}
                    disabled={loading || authLoading}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  {isSignUp && (
                    <>
                      <label htmlFor="sms-auth-contact-email">ایمیل <span>(اختیاری)</span></label>
                      <input
                        id="sms-auth-contact-email"
                        type="email"
                        autoComplete="email"
                        placeholder="name@example.com"
                        value={contactEmail}
                        disabled={loading}
                        onChange={(e) => setContactEmail(e.target.value)}
                      />
                    </>
                  )}
                </>
              )}

              {otpSent && (
                <>
                  <label htmlFor="sms-auth-otp">کد تأیید پیامک‌شده</label>
                  <input
                    id="sms-auth-otp"
                    className="sms-auth-otp-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9۰-۹٠-٩]{4,8}"
                    maxLength={8}
                    placeholder="••••••"
                    required
                    value={otpCode}
                    disabled={loading}
                    onChange={(e) => setOtpCode(e.target.value)}
                  />
                  <div className="sms-auth-hint">
                    کد ۴ تا ۸ رقمی را وارد کنید؛ اعداد فارسی یا انگلیسی قابل پذیرش است.
                  </div>
                </>
              )}
              <button className="sms-auth-primary" type="submit" disabled={loading}>
                {loading
                  ? 'لطفاً صبر کنید…'
                  : otpSent
                    ? isSignUp ? 'تأیید کد و ساخت حساب' : 'تأیید کد و ورود'
                    : 'ارسال کد تأیید'}
                <span aria-hidden="true">←</span>
              </button>
            </form>
          )}

          {!useEmailAuth && otpSent && (
            <button
              className="sms-auth-secondary"
              type="button"
              disabled={resendDisabled || loading}
              onClick={handleResendOtp}
            >
              {resendSeconds > 0
                ? `ارسال دوباره پس از ${toPersianDigits(resendSeconds)} ثانیه`
                : 'ارسال دوباره کد'}
            </button>
          )}

          {!otpSent && (
            <div className="sms-auth-actions">
              <button
                className="sms-auth-mode-toggle"
                type="button"
                disabled={loading || authLoading}
                onClick={handleSwitchMode}
              >
                {isSignUp
                  ? `حساب دارید؟ ورود با ${useEmailAuth ? 'ایمیل' : 'موبایل'}`
                  : `حساب ندارید؟ ثبت‌نام با ${useEmailAuth ? 'ایمیل' : 'موبایل'}`}
              </button>
              <div className="sms-auth-divider"><span>یا</span></div>
              <button
                className="sms-auth-secondary"
                type="button"
                disabled={loading || authLoading}
                onClick={useEmailAuth ? handleSwitchToPhone : handleSwitchToEmail}
              >
                {useEmailAuth
                  ? isSignUp ? 'ثبت‌نام با شماره موبایل' : 'ورود با شماره موبایل'
                  : isSignUp ? 'ثبت‌نام با ایمیل' : 'ورود با ایمیل'}
              </button>
            </div>
          )}
          <p className="sms-auth-privacy">ورود امن و سریع، برای مدیریت بهتر مراسم شما</p>
        </div>

        <aside className="sms-auth-showcase">
          <div className="sms-auth-showcase-top">
            <img src="/azho-logo.png" alt="" />
            <span>آژو <small>مدیریت هوشمند مراسم</small></span>
          </div>
          <div className="sms-auth-showcase-copy">
            <span className="sms-auth-showcase-label">همه‌چیز برای یک مراسم بی‌نقص</span>
            <h2>با خیال آسوده،<br />مراسم را مدیریت کنید.</h2>
            <p>از برنامه‌ریزی تا حساب‌وکتاب؛ همه ابزارهای کسب‌وکار شما در یک فضای ساده و یکپارچه.</p>
          </div>
          <div className="sms-auth-showcase-card">
            <span className="sms-auth-showcase-icon" aria-hidden="true">✦</span>
            <div>
              <strong>کسب‌وکار شما، همیشه منظم</strong>
              <span>مشتری‌ها، سفارش‌ها و گزارش‌ها در یک نگاه</span>
            </div>
          </div>
          <span className="sms-auth-showcase-footer">فضای کاری یکپارچه برای تشریفات آژو</span>
        </aside>
      </section>
    </main>
  );
}