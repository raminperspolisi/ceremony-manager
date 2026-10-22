# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## استفادهٔ آفلاین

برنامه پس از ورود آنلاین، داده‌های مشتریان، مراسم‌ها، تقویم، انبار، پیش‌فاکتورها و فاکتورهای رسمی را در حافظهٔ محلی همان مرورگر ذخیره می‌کند. ثبت، ویرایش و حذف هنگام قطع اینترنت در صف می‌ماند و پس از اتصال دوباره به‌صورت خودکار به Supabase فرستاده می‌شود. اگر یک رکورد از چند دستگاه تغییر کند، تغییرات این دستگاه طبق سیاست انتخاب‌شدهٔ پروژه روی نسخهٔ سرور اعمال می‌شوند.

### راه‌اندازی

1. پیش از فعال‌کردن نسخهٔ آفلاین، migration فایل `supabase/migrations/20261022000000_offline_sync_ids.sql` را در SQL Editor پروژهٔ Supabase اجرا کنید. این ستون‌های شناسهٔ یکتای همگام‌سازی را اضافه می‌کند تا قطع اتصال وسط ارسال باعث ثبت تکراری نشود.
   سیاست‌های RLS جدول‌های مورد استفاده نیز باید برای کاربران واردشده، عملیات لازم خواندن، افزودن، ویرایش و حذف را مجاز کنند؛ همگام‌سازی درج‌های آفلاین از `upsert` استفاده می‌کند.
2. برنامه را روی دامنهٔ HTTPS منتشر کنید؛ Service Worker برای ذخیرهٔ پوستهٔ برنامه به HTTPS نیاز دارد (به‌جز localhost).
3. یک‌بار آنلاین وارد حساب شوید و صبر کنید داده‌های اولیه بارگیری شوند. سپس می‌توانید همان مرورگر و دستگاه را بدون اینترنت باز کنید.
4. هنگام اتصال مجدد، صف به‌طور خودکار همگام می‌شود. وضعیت اتصال و خطاهای همگام‌سازی در سربرگ برنامه نمایش داده می‌شوند.

ورود اولیه، تغییر پروفایل/لوگو، چاپ و اشتراک‌گذاری تصویر، و ارسال پیام نیازمند اینترنت هستند. داده‌های آفلاین فقط در مرورگر و دستگاهی در دسترس‌اند که قبلاً آنلاین وارد حساب شده و داده‌ها را دریافت کرده باشد. در مرورگرهای دیگر یا حالت ناشناس، داده‌های ذخیره‌شده در دسترس نیستند.
