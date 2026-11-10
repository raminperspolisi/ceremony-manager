import unittest
from unittest.mock import patch

from run_bot import (
    custom_telegram_event_reminder_message,
    handle_telegram_reminder_link,
    telegram_event_reminder_message,
)


class TelegramReminderTests(unittest.TestCase):
    def test_custom_reminder_message_includes_event_and_pending_tasks(self):
        message = custom_telegram_event_reminder_message({
            "event_type": "عروسی",
            "customer_name": "مریم",
            "event_date": "2027-03-21",
            "pending_task_count": 2,
            "pending_tasks": ["هماهنگی گل‌آرایی"],
        })

        self.assertIn("یادآوری زمان‌بندی‌شده", message)
        self.assertIn("عروسی", message)
        self.assertIn("مریم", message)
        self.assertIn("۲۰۲۷-۰۳-۲۱", message)
        self.assertIn("هماهنگی گل‌آرایی", message)
        self.assertIn("۱ کار دیگر", message)

    def test_custom_reminder_message_reports_empty_checklist(self):
        message = custom_telegram_event_reminder_message({
            "event_date": "2027-03-21",
            "pending_task_count": 0,
            "pending_tasks": [],
        })

        self.assertIn("موردی باقی نمانده", message)

    def test_reminder_message_includes_event_and_pending_tasks(self):
        message = telegram_event_reminder_message({
            "days_before": 1,
            "event_type": "عروسی",
            "customer_name": "مریم",
            "event_date": "2026-11-11",
            "pending_tasks": ["هماهنگی گل‌آرایی"],
        })

        self.assertIn("فردا", message)
        self.assertIn("عروسی", message)
        self.assertIn("مریم", message)
        self.assertIn("هماهنگی گل‌آرایی", message)
        self.assertIn("۲۰۲۶-۱۱-۱۱", message)

    def test_link_command_only_accepts_private_chat_and_valid_token(self):
        token = "a" * 64
        message = {
            "text": f"/link {token}",
            "chat": {"id": 123, "type": "private"},
            "from": {"id": 123, "username": "ramin"},
        }

        with (
            patch("run_bot.TELEGRAM_REMINDER_SECRET", "secret"),
            patch("run_bot.complete_telegram_reminder_link") as complete_link,
            patch("run_bot.send_message") as send,
        ):
            self.assertTrue(handle_telegram_reminder_link(message))

        complete_link.assert_called_once_with(token, "123", "123", "ramin")
        self.assertIn("متصل شد", send.call_args.args[1])

    def test_group_chat_cannot_link_reminders(self):
        message = {
            "text": f"/link {'a' * 64}",
            "chat": {"id": -123, "type": "group"},
            "from": {"id": 123},
        }

        with (
            patch("run_bot.TELEGRAM_REMINDER_SECRET", "secret"),
            patch("run_bot.complete_telegram_reminder_link") as complete_link,
            patch("run_bot.send_message") as send,
        ):
            self.assertTrue(handle_telegram_reminder_link(message))

        complete_link.assert_not_called()
        self.assertIn("خصوصی", send.call_args.args[1])

    def test_link_command_accepts_newlines_and_directional_formatting(self):
        token = "a" * 32 + "\u200f" + "b" * 32
        message = {
            "text": f"/link\n{token[:32]}\n{token[33:]}",
            "chat": {"id": 123, "type": "private"},
            "from": {"id": 123, "username": "ramin"},
        }

        with (
            patch("run_bot.TELEGRAM_REMINDER_SECRET", "secret"),
            patch("run_bot.complete_telegram_reminder_link") as complete_link,
            patch("run_bot.send_message") as send,
        ):
            self.assertTrue(handle_telegram_reminder_link(message))

        complete_link.assert_called_once_with("a" * 32 + "b" * 32, "123", "123", "ramin")
        self.assertIn("متصل شد", send.call_args.args[1])

    def test_non_link_command_is_not_consumed(self):
        message = {
            "text": "/start",
            "chat": {"id": 123, "type": "private"},
            "from": {"id": 123},
        }
        self.assertFalse(handle_telegram_reminder_link(message))


if __name__ == "__main__":
    unittest.main()
