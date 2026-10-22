# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## نسخهٔ نصب‌شدنی و استفادهٔ آفلاین

برنامه یک PWA است: پوستهٔ برنامه و داده‌های کاربردی در حافظهٔ همان مرورگر/دستگاه ذخیره می‌شوند. مشتریان، مراسم‌ها، تقویم، انبار، پیش‌فاکتورها و فاکتورهای رسمی پس از بارگذاری اولیه آفلاین قابل مشاهده‌اند. ثبت، ویرایش و حذف آفلاین در صف امن محلی قرار می‌گیرد و بعد از اتصال، به‌طور خودکار با Supabase همگام می‌شود. Supabase منبع مشترک اطلاعات بین دستگاه‌هاست؛ دستگاه‌ها مستقیماً با هم ارتباط نمی‌گیرند.

### راه‌اندازی مدیر سامانه

1. در داشبورد Supabase، بخش **SQL Editor** را باز کنید و محتوای `supabase/migrations/20261022000000_offline_sync_ids.sql` را اجرا کنید. این migration برای درج‌های آفلاین شناسهٔ پایدار می‌سازد و در صورت تلاش مجدد، از درج تکراری جلوگیری می‌کند.
2. سیاست‌های RLS جدول‌های `customers`, `ceremonies`, `events`, `inventory`, `quotations` و `invoices` را بررسی کنید. کاربر واردشده باید مجوزهای لازم برای `SELECT`, `INSERT`, `UPDATE` و `DELETE` را داشته باشد. درج‌های آفلاین هنگام همگام‌سازی با `upsert` انجام می‌شوند؛ بنابراین سیاست‌های درج/به‌روزرسانی و دسترسی خواندن نیز باید با این روش سازگار باشند.
3. نسخهٔ production را روی دامنهٔ **HTTPS** منتشر کنید. Service Worker و نصب PWA روی دامنهٔ امن کار می‌کنند؛ `localhost` برای آزمایش محلی استثناست.

### نصب و استفاده روی گوشی یا دستگاه دیگر

1. روی گوشی، با Chrome یا مرورگر سازگار، نشانی HTTPS برنامه را باز کنید. در Android از منوی مرورگر **Install app / Add to Home screen** را بزنید؛ در iPhone با Safari، **Share → Add to Home Screen** را انتخاب کنید.
2. دستگاه را یک‌بار به اینترنت وصل کنید، برنامه را باز کنید و با حساب کاربری وارد شوید. تا وقتی سربرگ «در حال آماده‌سازی آفلاین…» را نشان می‌دهد، برنامه در حال ذخیرهٔ اطلاعات روی همان دستگاه است؛ برای اطمینان صبر کنید و بخش‌های موردنیاز را یک‌بار باز کنید.
3. بعد از آماده‌سازی، برنامه را می‌توانید بدون اینترنت از آیکن صفحهٔ اصلی باز کنید. تغییرات در همان دستگاه در صف می‌مانند.
4. با برگشت اینترنت، همگام‌سازی خودکار آغاز می‌شود. همچنین با بازگشت به برنامه یا آوردن آن به پیش‌زمینه، صف همگام‌سازی و داده‌های سرور به‌روز می‌شوند. وضعیت اتصال، آماده‌سازی و خطاهای همگام‌سازی در سربرگ برنامه دیده می‌شوند. اگر خطا باقی ماند، برنامه را آنلاین باز نگه دارید و **تلاش دوباره** را بزنید.
5. برای استفاده از دستگاه تازه، آن را یک‌بار آنلاین باز کنید، وارد حساب شوید و بگذارید داده‌ها روی همان دستگاه بارگیری شوند. حافظهٔ آفلاین بین دستگاه‌ها یا مرورگرها مشترک نیست؛ تب ناشناس نیز پس از بسته‌شدن معمولاً داده‌های محلی را نگه نمی‌دارد.

### محدودیت‌ها و تعارض ویرایش

- همگام‌سازی در زمانی انجام می‌شود که برنامه باز یا در پیش‌زمینه باشد؛ مرورگر ممکن است اجرای کار در پس‌زمینه یا هنگام بسته‌بودن برنامه را متوقف کند.
- اگر یک رکورد را هم‌زمان یا آفلاین روی چند دستگاه تغییر دهید، این نسخه تعارض را به‌صورت خودکار حل نمی‌کند؛ آخرین تغییری که به سرور همگام شود می‌تواند تغییر قبلی را جایگزین کند. برای جلوگیری از بازنویسی، یک رکورد را هم‌زمان روی چند دستگاه ویرایش نکنید.
- ورود اولیه، تغییر پروفایل/لوگو، چاپ و اشتراک‌گذاری تصویر و ارسال پیام به اینترنت نیاز دارند.
