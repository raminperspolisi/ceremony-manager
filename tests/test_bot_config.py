import unittest
from unittest.mock import patch

from run_bot import validate_settings


class BotConfigTests(unittest.TestCase):
    def test_approval_secret_is_not_required_to_start_bot(self):
        with (
            patch("run_bot.TELEGRAM_TOKEN", "token"),
            patch("run_bot.TELEGRAM_ADMIN_CHAT_ID", "1234"),
            patch("run_bot.ORDER_APPROVAL_SECRET", ""),
            patch("run_bot.SUPABASE_URL", "https://example.supabase.co"),
            patch("run_bot.SUPABASE_KEY", "anon-key"),
        ):
            validate_settings()

    def test_required_bot_settings_are_still_validated(self):
        with (
            patch("run_bot.TELEGRAM_TOKEN", ""),
            patch("run_bot.TELEGRAM_ADMIN_CHAT_ID", "1234"),
            patch("run_bot.ORDER_APPROVAL_SECRET", ""),
            patch("run_bot.SUPABASE_URL", "https://example.supabase.co"),
            patch("run_bot.SUPABASE_KEY", "anon-key"),
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "TELEGRAM_BOT_TOKEN",
            ):
                validate_settings()


if __name__ == "__main__":
    unittest.main()
