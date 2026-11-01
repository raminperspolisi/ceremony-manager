import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { normalizeIranianMobile, normalizeOtp } from '../authUtils';

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
    <section
      className={`sms-auth-panel ${className}`}
      style={{
        maxWidth: 420,
        margin: '10vh auto',
        padding: 24,
        direction: 'rtl',
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 8px 30px rgba(15, 23, 42, 0.1)',
        fontFamily: '"IRANSans", Tahoma, sans-serif',
      }}
    >
      <img
        src="/azho-logo.png"
        alt="لوگوی آژو مراسم"
        className="sms-auth-logo"
        style={{
          display: 'block',
          margin: '0 auto 16px',
          width: 56,
          height: 56,
        }}
      />
      <h1
        style={{
          margin: '0 0 8px',
          fontSize: 22,
          color: '#0f172a',
          textAlign: 'center',
        }}
      >
        {title}
      </h1>
      <p
        style={{
          margin: '0 0 20px',
          color: '#64748b',
          fontSize: 14,
          textAlign: 'center',
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>

      {(useEmailAuth ? emailAuthError : authError) && (
        <div
          role="alert"
          style={{
            marginBottom: 14,
            padding: 10,
            borderRadius: 6,
            color: '#b91c1c',
            background: '#fee2e2',
            fontSize: 14,
            textAlign: 'right',
          }}
        >
          {useEmailAuth ? emailAuthError : authError}
        </div>
      )}
      {(useEmailAuth ? emailAuthMessage : authMessage) && (
        <div
          role="status"
          style={{
            marginBottom: 14,
            padding: 10,
            borderRadius: 6,
            color: '#166534',
            background: '#dcfce7',
            fontSize: 14,
            textAlign: 'right',
          }}
        >
          {useEmailAuth ? emailAuthMessage : authMessage}
        </div>
      )}

      {useEmailAuth ? (
        <form
          onSubmit={isSignUp ? onEmailSignUp : onEmailSignIn}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <label htmlFor="email-auth-email" style={{ fontSize: 14, color: '#334155' }}>ایمیل</label>
          <input
            id="email-auth-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            disabled={authLoading}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: '100%',
              padding: 10,
              fontSize: 15,
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <label htmlFor="email-auth-password" style={{ fontSize: 14, color: '#334155' }}>گذرواژه</label>
          <input
            id="email-auth-password"
            type="password"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            minLength={6}
            required
            value={password}
            disabled={authLoading}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: '100%',
              padding: 10,
              fontSize: 15,
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <button
            type="submit"
            disabled={authLoading}
            style={{
              width: '100%',
              padding: 10,
              fontSize: 15,
              fontWeight: 600,
              color: '#fff',
              background: authLoading ? '#94a3b8' : '#28645a',
              border: 'none',
              borderRadius: 8,
              cursor: authLoading ? 'not-allowed' : 'pointer',
              opacity: authLoading ? 0.7 : 1,
            }}
          >
            {authLoading ? 'لطفاً صبر کنید…' : isSignUp ? 'ثبت‌نام با ایمیل' : 'ورود با ایمیل'}
          </button>
        </form>
      ) : (
        <form
          onSubmit={otpSent ? handleVerifyPhoneOtp : handleRequestPhoneOtp}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          {!otpSent && (
          <>
            <label
              htmlFor="sms-auth-phone"
              style={{
                display: 'block',
                marginBottom: 6,
                fontSize: 14,
                color: '#334155',
              }}
            >
              شماره موبایل
            </label>
            <input
              id="sms-auth-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              value={phone}
              disabled={loading || authLoading}
              onChange={(e) => setPhone(e.target.value)}
              style={{
                width: '100%',
                padding: 10,
                fontSize: 15,
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {isSignUp && !otpSent && (
              <>
                <label
                  htmlFor="sms-auth-contact-email"
                  style={{
                    display: 'block',
                    marginBottom: 6,
                    fontSize: 14,
                    color: '#334155',
                  }}
                >
                  ایمیل (اختیاری)
                </label>
                <input
                  id="sms-auth-contact-email"
                  type="email"
                  autoComplete="email"
                  value={contactEmail}
                  disabled={loading}
                  onChange={(e) => setContactEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 10,
                    fontSize: 15,
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </>
            )}
          </>
        )}

        {otpSent && (
          <>
            <label
              htmlFor="sms-auth-otp"
              style={{
                display: 'block',
                marginBottom: 6,
                fontSize: 14,
                color: '#334155',
              }}
            >
              کد تأیید پیامک‌شده
            </label>
            <input
              id="sms-auth-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9۰-۹٠-٩]{4,8}"
              maxLength={8}
              required
              value={otpCode}
              disabled={loading}
              onChange={(e) => setOtpCode(e.target.value)}
              style={{
                width: '100%',
                padding: 10,
                fontSize: 15,
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
              کد را به صورت ۴ تا ۸ رقمی وارد کنید (اعداد فارسی یا انگلیسی قابل پذیرش است).
            </div>
          </>
        )}
          <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: 10,
            fontSize: 15,
            fontWeight: 600,
            color: '#fff',
            background: loading ? '#94a3b8' : '#28645a',
            border: 'none',
            borderRadius: 8,
            cursor: loading || authLoading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading
            ? 'لطفاً صبر کنید…'
            : otpSent
              ? isSignUp
                ? 'تأیید کد و ساخت حساب'
                : 'تأیید کد و ورود'
              : 'ارسال کد تأیید'}
          </button>
        </form>
      )}

      {!useEmailAuth && otpSent && (
        <button
          type="button"
          disabled={resendDisabled || loading}
          onClick={handleResendOtp}
          style={{
            width: '100%',
            marginTop: 10,
            padding: 10,
            fontSize: 13,
            color: resendDisabled ? '#94a3b8' : '#28645a',
            background: 'transparent',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            cursor: resendDisabled || loading ? 'not-allowed' : 'pointer',
          }}
        >
          {resendSeconds > 0
            ? `ارسال دوباره پس از ${toPersianDigits(resendSeconds)} ثانیه`
            : 'ارسال دوباره کد'}
        </button>
      )}

      {!otpSent && (
        <button
          type="button"
          disabled={loading || authLoading}
          onClick={handleSwitchMode}
          style={{
            width: '100%',
            marginTop: 12,
            padding: 10,
            fontSize: 14,
            color: '#28645a',
            background: 'transparent',
            border: 'none',
            borderRadius: 8,
            cursor: loading || authLoading ? 'not-allowed' : 'pointer',
          }}
        >
          {isSignUp
            ? `حساب دارید؟ ورود با ${useEmailAuth ? 'ایمیل' : 'موبایل'}`
            : `حساب ندارید؟ ثبت‌نام با ${useEmailAuth ? 'ایمیل' : 'موبایل'}`}
        </button>
      )}

      {!otpSent && (
      <button
        type="button"
        disabled={loading || authLoading}
        onClick={useEmailAuth ? handleSwitchToPhone : handleSwitchToEmail}
        style={{
          width: '100%',
          marginTop: 8,
          padding: 10,
          fontSize: 14,
          color: '#64748b',
          background: 'transparent',
          border: '1px solid #cbd5e1',
          borderRadius: 8,
          cursor: loading || authLoading ? 'not-allowed' : 'pointer',
        }}
      >
        {useEmailAuth
          ? isSignUp ? 'ثبت‌نام با شماره موبایل' : 'ورود با شماره موبایل'
          : isSignUp ? 'ثبت‌نام با ایمیل' : 'ورود با ایمیل'}
      </button>
      )}
    </section>
  );
}