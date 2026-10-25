from pathlib import Path

from dotenv import dotenv_values


def main():
    settings = dotenv_values(Path(__file__).resolve().with_name(".env"))
    required = (
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_ADMIN_CHAT_ID",
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY",
    )
    missing = [name for name in required if not settings.get(name, "").strip()]
    if missing:
        print("Missing .env settings: " + ", ".join(missing))
        raise SystemExit(1)
    print("All required bot settings are present; secret values were not displayed.")


if __name__ == "__main__":
    main()
