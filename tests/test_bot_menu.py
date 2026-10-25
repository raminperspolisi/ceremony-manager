import unittest
from unittest.mock import patch

from run_bot import carts, send_cart, send_product_details, send_products


class BotMenuTests(unittest.TestCase):
    def setUp(self):
        carts.clear()

    def tearDown(self):
        carts.clear()

    def test_products_use_two_column_buttons_with_title_and_price(self):
        products = [
            {"id": 1, "title": "سفره عقد", "price_level1": 1250000},
            {"id": 2, "title": "گل‌آرایی", "price_level1": 2400000},
            {"id": 3, "title": "موسیقی", "price_level1": None},
        ]

        with patch("run_bot.send_message") as send:
            send_products(100, 200, products)

        text, markup = send.call_args.args[1:]
        keyboard = markup["inline_keyboard"]
        self.assertEqual(len(keyboard[0]), 2)
        self.assertEqual(len(keyboard[1]), 1)
        self.assertEqual(
            keyboard[0][0]["callback_data"],
            "detail:1:all:0",
        )
        self.assertIn("سفره عقد", keyboard[0][0]["text"])
        self.assertIn("۱,۲۵۰,۰۰۰", keyboard[0][0]["text"])
        self.assertIn("توافقی", keyboard[1][0]["text"])
        self.assertIn("──────────────", text)

    def test_product_details_include_prices_and_add_and_back_actions(self):
        product = {
            "id": 42,
            "title": "گل‌آرایی مراسم",
            "item_type": "sale",
            "price_level1": 1200000,
            "price_level2": 1100000,
            "price_level3": None,
            "description": "طراحی و اجرای گل‌آرایی",
        }

        with patch("run_bot.send_message") as send:
            send_product_details(100, product, "sale", 2)

        text, markup = send.call_args.args[1:]
        buttons = [
            button
            for row in markup["inline_keyboard"]
            for button in row
        ]
        self.assertIn("1,200,000 تومان", text)
        self.assertIn("1,100,000 تومان", text)
        self.assertIn("توافقی / نامشخص", text)
        self.assertIn("طراحی و اجرای گل‌آرایی", text)
        self.assertIn(
            "add:42:sale:2",
            [button["callback_data"] for button in buttons],
        )
        self.assertIn(
            "products:sale:2",
            [button["callback_data"] for button in buttons],
        )

    def test_cart_has_clear_final_order_button(self):
        carts["200"] = {"42": 1}
        products = [{"id": 42, "title": "گل‌آرایی", "price_level1": 1200000}]

        with patch("run_bot.send_message") as send:
            send_cart(100, 200, products)

        markup = send.call_args.args[2]
        buttons = [
            button
            for row in markup["inline_keyboard"]
            for button in row
        ]
        final_order = next(
            button for button in buttons
            if button["callback_data"] == "checkout"
        )
        self.assertEqual(final_order["text"], "🛒 ثبت سفارش نهایی")


if __name__ == "__main__":
    unittest.main()
