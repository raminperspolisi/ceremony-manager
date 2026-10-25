import os
import ssl
import time
from pathlib import Path
from urllib.parse import urlsplit

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().with_name(".env"))

TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_ADMIN_CHAT_ID = os.getenv("TELEGRAM_ADMIN_CHAT_ID", "").strip()
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()

TELEGRAM_URL = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}"
SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}
PRODUCTS_PER_PAGE = 8
MAX_CART_QUANTITY = 99
carts = {}


def telegram_request(method, payload):
    response = requests.post(
        f"{TELEGRAM_URL}/{method}",
        json=payload,
        timeout=10,
    )
    response.raise_for_status()
    result = response.json()
    if not result.get("ok"):
        raise RuntimeError(f"Telegram API method {method} failed.")
    return result


def telegram_error_description(response):
    if response is None:
        return None
    try:
        result = response.json()
    except ValueError:
        return None
    if not isinstance(result, dict):
        return None
    description = result.get("description")
    if not isinstance(description, str):
        return None
    description = " ".join(description.split())
    return description[:240] or None


def send_message(chat_id, text, reply_markup=None):
    payload = {"chat_id": chat_id, "text": f"\u200f{text}"}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    return telegram_request("sendMessage", payload)


def answer_callback(callback_query_id, text=None):
    payload = {"callback_query_id": callback_query_id}
    if text:
        payload["text"] = text[:180]
    telegram_request("answerCallbackQuery", payload)


def get_products():
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/bot_catalog",
        json={},
        headers=SUPABASE_HEADERS,
        timeout=12,
    )
    response.raise_for_status()
    products = response.json()
    if not isinstance(products, list) or any(
        not isinstance(product, dict) for product in products
    ):
        raise ValueError("Invalid product catalog response.")
    return products


def create_order(customer, username, telegram_user_id, items):
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/submit_bot_order",
        json={
            "p_telegram_user_id": str(telegram_user_id),
            "p_customer_name": customer,
            "p_telegram_username": username or "",
            "p_items": items,
        },
        headers=SUPABASE_HEADERS,
        timeout=12,
    )
    response.raise_for_status()
    result = response.json()
    if not isinstance(result, dict) or result.get("id") is None:
        raise ValueError("Invalid order submission response.")
    return result


def price_level_lines(product):
    levels = (
        ("price_level1", "قیمت سطح ۱"),
        ("price_level2", "قیمت سطح ۲"),
        ("price_level3", "قیمت سطح ۳"),
    )
    return [
        f"{label}: {format_price(product.get(key))}"
        for key, label in levels
    ]


def order_admin_message(order, customer, username, telegram_user_id):
    lines = [
        f"🛎 سفارش جدید ربات #{order['id']}",
        f"مشتری: {customer}",
        f"شناسه تلگرام: {telegram_user_id}",
    ]
    if username:
        lines.append(f"نام کاربری: @{username}")
    lines.append("")

    order_items = order.get("items")
    if not isinstance(order_items, list):
        order_items = []
    for item in order_items:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "کالای بدون عنوان").strip()
        lines.append(f"• {title} × {item.get('quantity', 1)}")
        lines.extend(price_level_lines(item))
        lines.append("")
    if order.get("total_price") is None:
        lines.append("حداقل یک کالا قیمت سطح ۱ ندارد؛ مدیر باید مبلغ را تعیین کند.")
    else:
        lines.append(
            f"جمع سفارش بر اساس قیمت سطح ۱: {format_price(order['total_price'])}"
        )
    lines.append("واریز را پس از بررسی گردش حساب تأیید کنید؛ موجودی انبار تغییر نمی‌کند.")
    message = "\n".join(lines)
    if len(message) > 3900:
        message = message[:3880].rsplit("\n", 1)[0] + "\n…\nجزئیات کامل در پنل سفارش‌های ربات"
    return message


def notify_admin_order(order, customer, username, telegram_user_id):
    try:
        send_message(
            TELEGRAM_ADMIN_CHAT_ID,
            order_admin_message(order, customer, username, telegram_user_id),
        )
    except requests.HTTPError as error:
        status = error.response.status_code if error.response is not None else "unknown"
        description = telegram_error_description(error.response)
        if description:
            print(
                f"Admin order notification failed (HTTP status: {status}): "
                f"{description}"
            )
        else:
            print(
                f"Admin order notification failed (HTTP status: {status}); "
                "details omitted."
            )
        return False
    except requests.RequestException as error:
        print(f"Admin order notification failed ({type(error).__name__}).")
        return False
    return True


def product_group(product):
    item_type = str(product.get("item_type") or "sale").strip().lower()
    return "rent" if item_type in {"rent", "اجاره", "اجاره‌ای", "اجاره اي"} else "sale"


def group_label(group):
    return "اجاره‌ای" if group == "rent" else "فروشی"


def format_price(value):
    if value is None:
        return "توافقی / نامشخص"
    try:
        return f"{int(float(value)):,} تومان"
    except (TypeError, ValueError, OverflowError):
        return "توافقی / نامشخص"


def persian_digits(value):
    return str(value).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def product_button_label(product):
    name = str(product.get("title") or "بدون عنوان").strip()
    if len(name) > 20:
        name = name[:19].rstrip() + "…"
    price = product.get("price_level1")
    if price is None:
        short_price = "توافقی"
    else:
        try:
            short_price = f"{int(float(price)):,} ت"
        except (TypeError, ValueError, OverflowError):
            short_price = "توافقی"
    return f"💍 {name} | 💵 {persian_digits(short_price)}"


def customer_order_message(order):
    order_id = order["id"]
    total_price = order.get("total_price")
    if total_price is None:
        return (
            f"درخواست شما با شمارهٔ #{order_id} ثبت شد. حداقل یک کالا قیمت سطح ۱ ندارد؛ "
            "فعلاً مبلغی واریز نکنید. مدیر مبلغ نهایی را اعلام می‌کند."
        )

    payment = order.get("payment_info")
    if not isinstance(payment, dict):
        return (
            f"درخواست شما با شمارهٔ #{order_id} ثبت شد و مبلغ آن "
            f"{format_price(total_price)} است، اما اطلاعات کارت مقصد کامل نیست. "
            "فعلاً واریز نکنید و برای دریافت راهنمایی با مدیر هماهنگ کنید."
        )

    card_number = str(payment.get("card_number") or "").strip()
    holder_name = str(payment.get("holder_name") or "").strip()
    if not card_number or not holder_name:
        return (
            f"درخواست شما با شمارهٔ #{order_id} ثبت شد و مبلغ آن "
            f"{format_price(total_price)} است، اما اطلاعات کارت مقصد کامل نیست. "
            "فعلاً واریز نکنید و برای دریافت راهنمایی با مدیر هماهنگ کنید."
        )

    lines = [
        f"درخواست شما با شمارهٔ #{order_id} ثبت شد.",
        f"مبلغ قابل پرداخت (بر اساس قیمت سطح ۱): {format_price(total_price)}",
    ]
    bank_name = str(payment.get("bank_name") or "").strip()
    if bank_name:
        lines.append(f"بانک: {bank_name}")
    lines.extend([
        f"شماره کارت مقصد: {card_number}",
        f"به نام: {holder_name}",
        "لطفاً شماره سفارش را نگه دارید. واریز پس از بررسی مدیر تأیید می‌شود.",
    ])
    return "\n".join(lines)


def main_menu():
    return {
        "inline_keyboard": [
            [
                {"text": "📂 مشاهده دسته‌ها", "callback_data": "categories"},
                {"text": "🛍 سفارش جدید", "callback_data": "new_order"},
            ],
            [{"text": "🛒 سبد خرید", "callback_data": "cart"}],
        ]
    }


def catalog_or_notify(chat_id):
    try:
        return get_products()
    except (requests.RequestException, ValueError) as error:
        if isinstance(error, requests.HTTPError) and error.response is not None:
            status = error.response.status_code
            if status == 404:
                reason = "RPC bot_catalog was not found; run the catalog migration."
            elif status in {401, 403}:
                reason = "Supabase rejected the anon key or RPC permission."
            else:
                reason = f"Supabase returned HTTP {status}."
            print(f"Catalog request failed: {reason}")
        elif isinstance(error, requests.Timeout):
            print("Catalog request timed out; check internet access and Supabase availability.")
        elif isinstance(error, requests.exceptions.SSLError) or isinstance(error, ssl.SSLError):
            print("Catalog TLS connection failed; check system date and network security settings.")
        elif isinstance(error, requests.ConnectionError):
            print(
                "Catalog request could not connect; verify internet access, "
                "Supabase URL, proxy, or firewall."
            )
        elif isinstance(error, ValueError):
            print("Catalog response was not valid JSON or had an unexpected format.")
        else:
            print(f"Catalog request failed ({type(error).__name__}); details omitted.")
        send_message(
            chat_id,
            "فعلاً دریافت فهرست محصولات ممکن نیست. کمی بعد دوباره تلاش کنید.",
        )
        return None


def send_categories(chat_id, products):
    available = {product_group(product) for product in products}
    groups = [group for group in ("sale", "rent") if group in available]
    if not groups:
        send_message(
            chat_id,
            "💍 خدمات و محصولات تشریفات\n──────────────\nفعلاً موردی برای نمایش نیست.",
            main_menu(),
        )
        return

    keyboard = [[
        {
            "text": f"✨ {group_label(group)}",
            "callback_data": f"category:{group}",
        }
        for group in groups
    ]]
    keyboard.append([{"text": "🔙 منوی اصلی", "callback_data": "home"}])
    send_message(
        chat_id,
        "💍 دسته‌بندی خدمات و محصولات\n──────────────\nدستهٔ موردنظر را انتخاب کنید:",
        {"inline_keyboard": keyboard},
    )


def send_products(chat_id, user_id, products, group=None, page=0):
    if group:
        products = [item for item in products if product_group(item) == group]
    group_key = group or "all"
    products = [
        item for item in products
        if str(item.get("id", "")).strip()
        and len(
            f"detail:{str(item.get('id')).strip()}:{group_key}:{page}".encode("utf-8")
        ) <= 64
    ]
    if not products:
        send_message(
            chat_id,
            "📋 فهرست خدمات\n──────────────\nدر این دسته موردی برای نمایش نیست.",
            main_menu(),
        )
        return

    page_count = (len(products) + PRODUCTS_PER_PAGE - 1) // PRODUCTS_PER_PAGE
    page = max(0, min(page, page_count - 1))
    page_products = products[page * PRODUCTS_PER_PAGE:(page + 1) * PRODUCTS_PER_PAGE]
    title = (
        f"محصولات دستهٔ {group_label(group)}:"
        if group
        else "محصولات موجود برای سفارش:"
    )
    keyboard = []
    listing = [
        f"💍 {title}",
        "──────────────",
        "برای مشاهدهٔ قیمت‌ها و جزئیات، یک گزینه را انتخاب کنید.",
    ]
    product_buttons = []
    for product in page_products:
        product_id = str(product.get("id", "")).strip()
        product_buttons.append({
            "text": product_button_label(product),
            "callback_data": f"detail:{product_id}:{group_key}:{page}",
        })

    keyboard.extend(
        product_buttons[index:index + 2]
        for index in range(0, len(product_buttons), 2)
    )

    paging = []
    if page > 0:
        paging.append({
            "text": "⬅️ قبلی",
            "callback_data": f"products:{group or 'all'}:{page - 1}",
        })
    if page + 1 < page_count:
        paging.append({
            "text": "بعدی ➡️",
            "callback_data": f"products:{group or 'all'}:{page + 1}",
        })
    if paging:
        keyboard.append(paging)
    if page_count > 1:
        keyboard.append([{
            "text": f"صفحهٔ {persian_digits(page + 1)} از {persian_digits(page_count)}",
            "callback_data": "noop",
        }])
    if carts.get(str(user_id)):
        keyboard.append([{"text": "🛒 مشاهدهٔ سبد خرید", "callback_data": "cart"}])
    keyboard.extend([
        [{"text": "📂 دسته‌ها", "callback_data": "categories"}],
        [{"text": "🔙 بازگشت به منوی اصلی", "callback_data": "home"}],
    ])
    send_message(chat_id, "\n".join(listing), {"inline_keyboard": keyboard})


def send_product_details(chat_id, product, group, page):
    product_id = str(product.get("id", "")).strip()
    title = str(product.get("title") or "بدون عنوان").strip()
    description = str(product.get("description") or "").strip()
    if len(description) > 1200:
        description = description[:1197].rstrip() + "…"

    lines = [
        f"💍 {title}",
        "──────────────",
        f"🏷️ نوع: {group_label(product_group(product))}",
        "💵 قیمت‌ها:",
        *price_level_lines(product),
    ]
    if description:
        lines.extend(["", f"✨ توضیحات: {description}"])

    keyboard = [
        [{
            "text": "➕ افزودن به سبد خرید",
            "callback_data": f"add:{product_id}:{group}:{page}",
        }],
        [{
            "text": "🔙 بازگشت به فهرست",
            "callback_data": f"products:{group}:{page}",
        }],
        [{"text": "🔙 بازگشت به منوی اصلی", "callback_data": "home"}],
    ]
    send_message(chat_id, "\n".join(lines), {"inline_keyboard": keyboard})


def send_cart(chat_id, user_id, products):
    user_cart = carts.get(str(user_id), {})
    if not user_cart:
        send_message(
            chat_id,
            "🛒 سبد خرید شما خالی است.\n──────────────\nبرای شروع، خدمات موردنظرتان را انتخاب کنید.",
            main_menu(),
        )
        return

    products_by_id = {str(item.get("id")): item for item in products}
    lines = ["🛒 سبد خرید شما", "──────────────"]
    keyboard = []

    for index, (product_id, quantity) in enumerate(user_cart.items()):
        product = products_by_id.get(product_id)
        if not product:
            lines.append(f"شناسهٔ {product_id}: این محصول دیگر در فهرست نیست.")
            keyboard.append([{
                "text": f"حذف محصول ناموجود ({product_id[:12]})",
                "callback_data": f"remove:{product_id}",
            }])
            continue

        title = str(product.get("title") or "بدون عنوان")
        lines.append(f"💍 {title} × {persian_digits(quantity)}")
        lines.extend(price_level_lines(product))
        if index + 1 < len(user_cart):
            lines.append("──────────────")
        keyboard.append([{
            "text": f"➖ {title[:32]}",
            "callback_data": f"remove:{product_id}",
        }])

    lines.append("\n💵 مبلغ نهایی بر اساس قیمت سطح ۱ محاسبه می‌شود.")
    lines.append("اگر قیمت سطح ۱ کالایی ثبت نشده باشد، مدیر مبلغ را جداگانه اعلام می‌کند.")
    lines.append("موجودی انبار با ثبت سفارش تغییر نمی‌کند.")
    keyboard.extend([
        [{"text": "🛒 ثبت سفارش نهایی", "callback_data": "checkout"}],
        [{"text": "🛍 ادامهٔ انتخاب", "callback_data": "new_order"}],
        [{"text": "🔙 بازگشت به منوی اصلی", "callback_data": "home"}],
    ])
    send_message(chat_id, "\n".join(lines), {"inline_keyboard": keyboard})


def submit_order(chat_id, user, products):
    user_id = str(user["id"])
    user_cart = carts.get(user_id, {})
    if not user_cart:
        send_message(chat_id, "سبد خرید شما خالی است.", main_menu())
        return

    products_by_id = {str(item.get("id")): item for item in products}
    selected = []
    for product_id, quantity in user_cart.items():
        product = products_by_id.get(product_id)
        if not product:
            send_message(
                chat_id,
                "یکی از محصولات سبد دیگر موجود نیست؛ سبد خرید را بررسی کنید.",
                {"inline_keyboard": [[{
                    "text": "🛒 بررسی سبد",
                    "callback_data": "cart",
                }]]},
            )
            return
        selected.append((product, quantity))

    customer = " ".join(
        part.strip()
        for part in (
            str(user.get("first_name") or ""),
            str(user.get("last_name") or ""),
        )
        if part.strip()
    ) or "مشتری تلگرام"
    order_items = [
        {"id": str(product.get("id")), "quantity": quantity}
        for product, quantity in selected
    ]
    try:
        order = create_order(
            customer,
            str(user.get("username") or ""),
            user_id,
            order_items,
        )
    except requests.HTTPError as error:
        status = error.response.status_code if error.response is not None else "unknown"
        print(f"Order registration failed (HTTP status: {status}); details omitted.")
        if status == 404:
            customer_message = (
                "ثبت سفارش هنوز در پایگاه داده فعال نیست. مدیر باید migrationهای "
                "سفارش ربات را در Supabase اجرا کند؛ سبد خرید پاک نشده است."
            )
        elif status in {401, 403}:
            customer_message = (
                "دسترسی ثبت سفارش در Supabase تأیید نشد؛ لطفاً مدیر تنظیمات را بررسی کند. "
                "سبد خرید پاک نشده است."
            )
        else:
            customer_message = (
                "ثبت سفارش در نرم‌افزار ناموفق بود. لطفاً کمی بعد دوباره تلاش کنید؛ "
                "سبد خرید پاک نشده است."
            )
        send_message(
            chat_id,
            customer_message,
        )
        return
    except (requests.RequestException, ValueError) as error:
        print(f"Order registration failed ({type(error).__name__}); details omitted.")
        send_message(
            chat_id,
            "ارتباط برای ثبت سفارش برقرار نشد. لطفاً دوباره تلاش کنید؛ "
            "سبد خرید پاک نشده است.",
        )
        return

    admin_notified = notify_admin_order(
        order,
        customer,
        str(user.get("username") or ""),
        user_id,
    )
    carts.pop(user_id, None)
    notification_status = (
        "مدیر هم از طریق تلگرام مطلع شد."
        if admin_notified
        else "سفارش ذخیره شد، اما اعلان تلگرامی مدیر ارسال نشد؛ لطفاً با مدیر تماس بگیرید."
    )
    if order.get("total_price") is not None and not isinstance(
        order.get("payment_info"), dict
    ):
        print(
            f"Order #{order['id']} has no complete bank account details; "
            "payment instructions were withheld."
        )
    send_message(
        chat_id,
        f"{customer_order_message(order)}\n{notification_status}",
        main_menu(),
    )


def handle_callback(callback):
    callback_id = callback["id"]
    callback_data = str(callback.get("data") or "")
    message = callback.get("message")
    user = callback.get("from") or {}
    if not message or not user.get("id"):
        answer_callback(callback_id)
        return

    chat_id = message["chat"]["id"]
    user_id = str(user["id"])
    answer_callback(callback_id)

    if callback_data in {"home", "back_home"}:
        send_message(
            chat_id,
            "💍 به فروشگاه تشریفات آژو خوش آمدید.\n"
            "──────────────\n"
            "برای دیدن خدمات، قیمت‌ها و ثبت سفارش یکی از گزینه‌ها را انتخاب کنید.",
            main_menu(),
        )
        return
    if callback_data == "noop":
        return
    if callback_data == "cart" and not carts.get(user_id):
        send_message(chat_id, "سبد خرید شما خالی است.", main_menu())
        return

    products = catalog_or_notify(chat_id)
    if products is None:
        return

    if callback_data == "categories":
        send_categories(chat_id, products)
    elif callback_data in {"new_order", "show_products"}:
        send_products(chat_id, user_id, products)
    elif callback_data.startswith("category:"):
        group = callback_data.partition(":")[2]
        if group not in {"sale", "rent"}:
            send_message(chat_id, "دستهٔ انتخاب‌شده معتبر نیست.", main_menu())
        else:
            send_products(chat_id, user_id, products, group=group)
    elif callback_data.startswith("detail:"):
        try:
            _, product_id, group, page_text = callback_data.split(":", 3)
            page = int(page_text)
            if page < 0 or group not in {"all", "sale", "rent"}:
                raise ValueError
        except ValueError:
            send_message(chat_id, "گزینهٔ انتخاب‌شده معتبر نیست.", main_menu())
            return
        product = next(
            (item for item in products if str(item.get("id")) == product_id),
            None,
        )
        if product is None:
            send_message(
                chat_id,
                "این خدمت دیگر در فهرست موجود نیست. لطفاً فهرست را تازه کنید.",
                {"inline_keyboard": [[{
                    "text": "🔙 بازگشت به فهرست",
                    "callback_data": f"products:{group}:{page}",
                }]]},
            )
            return
        send_product_details(chat_id, product, group, page)
    elif callback_data.startswith("products:"):
        try:
            _, group, page_text = callback_data.split(":", 2)
            page = int(page_text)
            if page < 0 or group not in {"all", "sale", "rent"}:
                raise ValueError
        except ValueError:
            send_message(chat_id, "صفحهٔ انتخاب‌شده معتبر نیست.", main_menu())
        else:
            send_products(
                chat_id,
                user_id,
                products,
                group=None if group == "all" else group,
                page=page,
            )
    elif callback_data.startswith("add:"):
        parts = callback_data.split(":")
        product_id = parts[1] if len(parts) > 1 else ""
        if not any(str(item.get("id")) == product_id for item in products):
            send_message(chat_id, "این محصول دیگر در فهرست موجود نیست.", main_menu())
            return
        user_cart = carts.setdefault(user_id, {})
        user_cart[product_id] = min(
            user_cart.get(product_id, 0) + 1,
            MAX_CART_QUANTITY,
        )
        group = parts[2] if len(parts) > 2 else "all"
        try:
            page = int(parts[3]) if len(parts) > 3 else 0
            if page < 0 or group not in {"all", "sale", "rent"}:
                raise ValueError
        except ValueError:
            group, page = "all", 0
        send_products(
            chat_id,
            user_id,
            products,
            group=None if group == "all" else group,
            page=page,
        )
    elif callback_data.startswith("remove:"):
        product_id = callback_data.partition(":")[2]
        user_cart = carts.get(user_id, {})
        quantity = user_cart.get(product_id, 0)
        if quantity > 1:
            user_cart[product_id] = quantity - 1
        else:
            user_cart.pop(product_id, None)
        if not user_cart:
            carts.pop(user_id, None)
        send_cart(chat_id, user_id, products)
    elif callback_data == "cart":
        send_cart(chat_id, user_id, products)
    elif callback_data == "checkout":
        submit_order(chat_id, user, products)


def validate_settings():
    required = {
        "TELEGRAM_BOT_TOKEN": TELEGRAM_TOKEN,
        "TELEGRAM_ADMIN_CHAT_ID": TELEGRAM_ADMIN_CHAT_ID,
        "SUPABASE_URL": SUPABASE_URL,
        "SUPABASE_ANON_KEY": SUPABASE_KEY,
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise RuntimeError(
            "Required settings missing from .env: " + ", ".join(missing)
        )

    try:
        supabase_url = urlsplit(SUPABASE_URL)
        valid_origin = (
            supabase_url.scheme == "https"
            and bool(supabase_url.hostname)
            and not supabase_url.query
            and not supabase_url.fragment
        )
        has_extra_path = bool(supabase_url.path.strip("/"))
    except ValueError:
        valid_origin = False
        has_extra_path = False
    if not valid_origin or has_extra_path:
        raise RuntimeError(
            "SUPABASE_URL must contain only the HTTPS Project URL origin "
            "from Supabase Dashboard > Project Settings > API; remove any "
            "path such as /rest/v1."
        )
    try:
        int(TELEGRAM_ADMIN_CHAT_ID)
    except ValueError as error:
        raise RuntimeError("TELEGRAM_ADMIN_CHAT_ID must be a numeric Telegram chat ID.") from error


def main():
    validate_settings()
    offset = 0
    print("Telegram catalog bot is ready.")

    while True:
        try:
            response = requests.get(
                f"{TELEGRAM_URL}/getUpdates",
                params={"offset": offset, "timeout": 30},
                timeout=35,
            )
            response.raise_for_status()
            result = response.json()
            if not result.get("ok"):
                raise RuntimeError("Telegram getUpdates failed.")

            for update in result.get("result", []):
                offset = update["update_id"] + 1
                if "callback_query" in update:
                    handle_callback(update["callback_query"])
                    continue

                message = update.get("message")
                if not message or not message.get("text"):
                    continue
                chat_id = message["chat"]["id"]
                text = message["text"].strip()
                if text.startswith("/start"):
                    send_message(
                        chat_id,
                        "💍 به فروشگاه تشریفات آژو خوش آمدید.\n"
                        "──────────────\n"
                        "برای دیدن خدمات، قیمت‌ها و ثبت سفارش یکی از گزینه‌ها را انتخاب کنید.",
                        main_menu(),
                    )
                elif text.startswith("/cancel"):
                    carts.pop(str(message.get("from", {}).get("id")), None)
                    send_message(chat_id, "سبد خرید شما پاک شد.", main_menu())

        except requests.HTTPError as error:
            status = (
                error.response.status_code
                if error.response is not None
                else "unknown"
            )
            description = telegram_error_description(error.response)
            if description:
                print(
                    f"Bot request failed (HTTP status: {status}): "
                    f"{description}"
                )
            else:
                print(
                    f"Bot request failed (HTTP status: {status}); "
                    "details omitted."
                )
            time.sleep(3)
        except (requests.RequestException, ValueError, KeyError, RuntimeError) as error:
            print(f"Bot request failed ({type(error).__name__}); details omitted.")
            time.sleep(3)
        except KeyboardInterrupt:
            print("Telegram catalog bot stopped.")
            return


if __name__ == "__main__":
    main()
