import unittest
from unittest.mock import patch

from run_bot import (
    custom_telegram_event_reminder_message,
    handle_telegram_reminder_link,
    telegram_event_reminder_message,
    telegram_workspace_task_reminder_message,
    process_pending_telegram_workspace_task_reminders,
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

    def test_workspace_task_reminder_message_includes_notes_and_tehran_time(self):
        message = telegram_workspace_task_reminder_message({
            "title": "هماهنگی تهران",
            "notes": "با تیم تماس گرفته شود",
            "remind_at": "2026-11-15T05:30:00+00:00",
        })

        self.assertIn("یادآوری کار دفترچه", message)
        self.assertIn("هماهنگی تهران", message)
        self.assertIn("با تیم تماس گرفته شود", message)
        self.assertIn("۲۰۲۶-۱۱-۱۵ ۰۹:۰۰", message)

    def test_workspace_task_reminder_worker_sends_and_finishes_claimed_reminders(self):
        reminder = {
            "id": "reminder-id",
            "chat_id": "123",
            "title": "هماهنگی تهران",
            "notes": None,
            "remind_at": "2026-11-15T05:30:00+00:00",
        }
        with (
            patch("run_bot.TELEGRAM_REMINDER_SECRET", "secret"),
            patch("run_bot.claim_telegram_workspace_task_reminder", return_value=reminder),
            patch("run_bot.send_message") as send,
            patch("run_bot.finish_telegram_workspace_task_reminder") as finish,
        ):
            process_pending_telegram_workspace_task_reminders(limit=1)

        self.assertEqual(send.call_args.args[0], "123")
        self.assertIn("هماهنگی تهران", send.call_args.args[1])
        finish.assert_called_once_with("reminder-id", True)

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
