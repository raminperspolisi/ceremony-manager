import unittest

from run_bot import customer_order_message


class CustomerOrderMessageTests(unittest.TestCase):
    def test_priced_order_includes_payment_details(self):
        message = customer_order_message({
            "id": 42,
            "total_price": 125000,
            "payment_info": {
                "bank_name": "بانک نمونه",
                "card_number": "1234567812345678",
                "holder_name": "نام صاحب حساب",
            },
        })

        self.assertIn("#42", message)
        self.assertIn("125,000 تومان", message)
        self.assertIn("1234567812345678", message)
        self.assertIn("نام صاحب حساب", message)
        self.assertIn("بررسی مدیر", message)

    def test_unpriced_order_does_not_show_payment_details(self):
        message = customer_order_message({
            "id": 43,
            "total_price": None,
            "payment_info": {
                "card_number": "1234567812345678",
                "holder_name": "نام صاحب حساب",
            },
        })

        self.assertIn("#43", message)
        self.assertIn("واریز نکنید", message)
        self.assertNotIn("1234567812345678", message)

    def test_missing_payment_details_blocks_transfer(self):
        message = customer_order_message({
            "id": 44,
            "total_price": 50000,
            "payment_info": None,
        })

        self.assertIn("50,000 تومان", message)
        self.assertIn("اطلاعات کارت مقصد کامل نیست", message)
        self.assertIn("واریز نکنید", message)


if __name__ == "__main__":
    unittest.main()
