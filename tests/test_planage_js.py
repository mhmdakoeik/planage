# -*- coding: utf-8 -*-
from odoo.tests import HttpCase, tagged, no_retry


def unit_test_error_checker(message):
    return '[HOOT]' not in message


@tagged("post_install", "-at_install")
class TestPlanageJS(HttpCase):

    @no_retry
    def test_unit_desktop(self):
        # Runs the Hoot unit test suite (all installed modules, including
        # planage's static/tests/*.test.js) in a headless browser.
        self.browser_js(
            "/web/tests?headless&loglevel=2&preset=desktop&timeout=15000",
            "", "", login="admin", timeout=600,
            success_signal="[HOOT] Test suite succeeded",
            error_checker=unit_test_error_checker,
        )
