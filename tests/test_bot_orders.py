import unittest
from unittest.mock import patch

from run_bot import (
    admin_order_keyboard,
    awaiting_receipts,
    customer_order_message,
    handle_callback,
    handle_admin_order_action,
    handle_receipt_message,
    handle_receipt_request,
    is_admin_callback,
    order_admin_message,
    payment_instruction_message,
)


class BotOrderWorkflowTests(unittest.TestCase):
    def test_new_order_message_withholds_card_until_approval(self):
        message = customer_order_message({
            "id": 42,
            "total_price": 125000,
            "payment_info": {
                "card_number": "6037123412345678",
                "holder_name": "نام صاحب حساب",
            },
        })

        self.assertIn("#۴۲", message)
        self.assertIn("125,000 تومان", message)
        self.assertIn("در انتظار بررسی مدیر", message)
        self.assertIn("واریز نکنید", message)
        self.assertNotIn("6037", message)

    def test_unpriced_order_waits_for_manager_amount(self):
        message = customer_order_message({"id": 43, "total_price": None})

        self.assertIn("مبلغ نهایی پس از بررسی مدیر اعلام می‌شود", message)
        self.assertIn("واریز نکنید", message)

    def test_approved_payment_message_includes_card_and_manual_review_notice(self):
        message = payment_instruction_message({
            "id": 44,
            "total_price": 125000,
            "payment_info": {
                "card_number": "6037123412345678",
                "holder_name": "<نام صاحب حساب>",
                "bank_name": "بانک & نمونه",
            },
        })

        self.assertIn("✨ سفارش شما با موفقیت تایید شد.", message)
        self.assertIn("💵 مبلغ قابل پرداخت: 125,000 تومان", message)
        self.assertIn("شماره کارت: ۶۰۳۷ ۱۲۳۴ ۱۲۳۴ ۵۶۷۸", message)
        self.assertIn("به نام: <نام صاحب حساب>", message)
        self.assertIn("بانک: بانک & نمونه", message)
        self.assertIn("نیازمند بررسی مدیر", message)

    def test_payment_message_requires_valid_bank_details(self):
        with self.assertRaisesRegex(ValueError, "valid bank card number"):
            payment_instruction_message({"id": 44, "total_price": 125000})

    def test_admin_invoice_includes_order_customer_items_and_total(self):
        message = order_admin_message(
            {
                "id": 45,
                "items": [{
                    "title": "گل‌آرایی",
                    "quantity": 2,
                    "unit_price": 125000,
                }],
                "total_price": 250000,
            },
            "نام مشتری",
            "customer",
            "1234",
        )

        self.assertIn("#45", message)
        self.assertIn("نام مشتری", message)
        self.assertIn("@customer", message)
        self.assertIn("گل‌آرایی × ۲", message)
        self.assertIn("250,000 تومان", message)

    def test_admin_invoice_buttons_have_approve_and_reject_actions(self):
        buttons = admin_order_keyboard(46)["inline_keyboard"][0]

        self.assertEqual(buttons[0]["text"], "✅ تایید سفارش")
        self.assertEqual(buttons[0]["callback_data"], "order:approve:46")
        self.assertEqual(buttons[1]["text"], "❌ رد سفارش")
        self.assertEqual(buttons[1]["callback_data"], "order:reject:46")

    def test_admin_order_callback_routes_to_action_handler(self):
        callback = {
            "id": "callback-admin",
            "data": "order:approve:42",
            "message": {"chat": {"id": 1234, "type": "private"}},
            "from": {"id": 1234},
        }

        with (
            patch("run_bot.handle_admin_order_action") as action,
            patch("run_bot.answer_callback") as answer,
        ):
            handle_callback(callback)

        action.assert_called_once_with(
            callback,
            "approve",
            42,
            callback_answered=True,
        )
        answer.assert_called_once_with("callback-admin", "در حال بررسی سفارش...")

    def test_approval_callback_requires_admin_private_chat(self):
        callback = {
            "message": {
                "chat": {"id": 1234, "type": "private"},
            },
            "from": {"id": 1234},
        }
        with patch("run_bot.TELEGRAM_ADMIN_CHAT_ID", "1234"):
            self.assertTrue(is_admin_callback(callback))
            callback["from"]["id"] = "1234"
            callback["message"]["chat"]["id"] = "1234"
            self.assertTrue(is_admin_callback(callback))
            callback["from"]["id"] = 5678
            self.assertFalse(is_admin_callback(callback))
            callback["from"]["id"] = 1234
            callback["message"]["chat"]["type"] = "group"
            self.assertFalse(is_admin_callback(callback))

    def test_admin_approval_sends_card_details_and_receipt_button(self):
        callback = {
            "id": "callback-1",
            "message": {
                "chat": {"id": 1234, "type": "private"},
                "message_id": 77,
            },
            "from": {"id": 1234},
        }
        approved_order = {
            "id": 42,
            "telegram_user_id": "9001",
            "total_price": 125000,
            "changed": True,
            "payment_info": {
                "card_number": "6037123412345678",
                "holder_name": "نام صاحب حساب",
                "bank_name": "بانک نمونه",
            },
        }

        with (
            patch("run_bot.TELEGRAM_ADMIN_CHAT_ID", "1234"),
            patch("run_bot.process_bot_order_action", return_value=approved_order) as rpc,
            patch("run_bot.answer_callback") as answer,
            patch("run_bot.edit_message_text") as edit,
            patch("run_bot.send_message") as send,
        ):
            handle_admin_order_action(callback, "approve", 42)

        rpc.assert_called_once_with(42, "approve")
        answer.assert_called_once_with("callback-1", "سفارش تأیید شد.")
        self.assertIn("تایید شد", edit.call_args.args[2])
        self.assertEqual(send.call_args.args[0], "9001")
        self.assertIn("125,000 تومان", send.call_args.args[1])
        self.assertIn("۶۰۳۷ ۱۲۳۴ ۱۲۳۴ ۵۶۷۸", send.call_args.args[1])
        self.assertIn("نیازمند بررسی مدیر", send.call_args.args[1])
        self.assertEqual(
            send.call_args.args[2]["inline_keyboard"][0][0],
            {
                "text": "📤 ارسال رسید و فیش پرداخت",
                "callback_data": "order:receipt:42",
            },
        )
        self.assertEqual(len(send.call_args.args[2]["inline_keyboard"]), 1)

    def test_card_details_delivery_failure_logs_telegram_error(self):
        callback = {
            "id": "callback-send-failed",
            "message": {
                "chat": {"id": 1234, "type": "private"},
                "message_id": 77,
            },
            "from": {"id": 1234},
        }
        approved_order = {
            "id": 42,
            "telegram_user_id": "9001",
            "total_price": 125000,
            "changed": True,
            "payment_info": {
                "card_number": "6037123412345678",
                "holder_name": "نام صاحب حساب",
                "bank_name": "بانک نمونه",
            },
        }

        with (
            patch("run_bot.TELEGRAM_ADMIN_CHAT_ID", "1234"),
            patch("run_bot.process_bot_order_action", return_value=approved_order),
            patch("run_bot.answer_callback"),
            patch("run_bot.edit_message_text"),
            patch(
                "run_bot.send_message",
                side_effect=RuntimeError(
                    "Telegram API method sendMessage failed: bot was blocked"
                ),
            ),
            patch("builtins.print") as log,
        ):
            handle_admin_order_action(callback, "approve", 42)

        self.assertTrue(any(
            "bot was blocked" in str(call.args[0])
            for call in log.call_args_list
        ))

    def test_unauthorized_admin_callback_never_calls_database(self):
        callback = {
            "id": "callback-2",
            "message": {
                "chat": {"id": 1234, "type": "private"},
                "message_id": 78,
            },
            "from": {"id": 5678},
        }

        with (
            patch("run_bot.TELEGRAM_ADMIN_CHAT_ID", "1234"),
            patch("run_bot.process_bot_order_action") as rpc,
            patch("run_bot.answer_callback") as answer,
        ):
            handle_admin_order_action(callback, "approve", 42)

        rpc.assert_not_called()
        answer.assert_called_once_with(
            "callback-2",
            "این دکمه فقط برای مدیر سفارش است.",
        )

    def test_receipt_is_verified_against_order_owner_and_forwarded(self):
        callback = {
            "id": "callback-3",
            "message": {"chat": {"id": 9001, "type": "private"}},
            "from": {"id": 9001},
        }
        awaiting_receipts.clear()

        with (
            patch(
                "run_bot.process_bot_order_action",
                return_value={
                    "id": 42,
                    "telegram_user_id": "9001",
                    "status": "approved",
                },
            ) as rpc,
            patch("run_bot.answer_callback") as answer,
            patch("run_bot.send_message") as send,
        ):
            handle_receipt_request(callback, 42)

        rpc.assert_called_once_with(42, "receipt")
        self.assertEqual(awaiting_receipts["9001"], "42")
        answer.assert_called_once()
        send.assert_called_once()

        photo_message = {
            "from": {
                "id": 9001,
                "first_name": "نام",
                "username": "customer",
            },
            "chat": {"id": 9001},
            "message_id": 12,
            "photo": [{"file_id": "photo-id"}],
        }
        with (
            patch("run_bot.forward_message") as forward,
            patch(
                "run_bot.process_bot_order_action",
                return_value={"id": 42, "status": "payment_review", "changed": True},
            ) as update_status,
            patch("run_bot.send_message") as send,
        ):
            self.assertTrue(handle_receipt_message(photo_message))

        forward.assert_called_once()
        update_status.assert_called_once_with(42, "payment_review")
        self.assertNotIn("9001", awaiting_receipts)
        self.assertIn("برای مدیر ارسال شد", send.call_args.args[1])
        self.assertIn("به‌تنهایی تأیید واریز محسوب نمی‌شود", send.call_args.args[1])


if __name__ == "__main__":
    unittest.main()
