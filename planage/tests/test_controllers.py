# -*- coding: utf-8 -*-
import base64
from unittest.mock import patch

from odoo.tests.common import HttpCase, tagged


@tagged("post_install", "-at_install")
class TestPlanageControllers(HttpCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        group_user = cls.env.ref("planage.group_planage_user")

        cls.plain_user = cls.env["res.users"].create({
            "name": "Plain Employee",
            "login": "planage_plain_user",
            "email": "planage_plain_user@example.com",
            "password": "planage_plain_user",
            "group_ids": [(6, 0, [group_user.id])],
        })

        cls.space = cls.env["planage.space"].create({"name": "Ctrl Space"})
        cls.project = cls.env["planage.project"].create({
            "name": "Ctrl Project",
            "space_id": cls.space.id,
        })
        cls.task = cls.env["planage.task"].create({
            "name": "Ctrl Task",
            "project_id": cls.project.id,
        })

    def test_reset_denied_for_non_admin(self):
        self.authenticate("planage_plain_user", "planage_plain_user")
        result = self.make_jsonrpc_request("/planage/reset", {})
        self.assertIn("error", result)
        # Data must survive the denied reset attempt.
        self.assertTrue(self.project.exists())

    def test_reset_denied_outside_dev_mode(self):
        self.authenticate("admin", "admin")
        result = self.make_jsonrpc_request("/planage/reset", {})
        self.assertIn("error", result)
        # Data must survive: reset is only available when Odoo runs with --dev.
        self.assertTrue(self.project.exists())

    def test_reset_allowed_for_admin_in_dev_mode(self):
        self.authenticate("admin", "admin")
        with patch("odoo.addons.planage.controllers.main.config", {"dev_mode": ["xml"]}):
            result = self.make_jsonrpc_request("/planage/reset", {})
        self.assertTrue(result.get("success"))
        self.assertFalse(self.project.exists())

    def test_write_task_ignores_disallowed_fields(self):
        self.authenticate("admin", "admin")
        other_project = self.env["planage.project"].create({
            "name": "Other Project",
            "space_id": self.space.id,
        })
        result = self.make_jsonrpc_request("/planage/task/write", {
            "task_id": self.task.id,
            "vals": {"name": "Renamed", "project_id": other_project.id},
        })
        self.assertEqual(result["name"], "Renamed")
        # project_id is not in the write whitelist, so it must be unchanged.
        self.assertEqual(result["project_id"], self.project.id)

    def test_write_notification_ignores_disallowed_fields(self):
        self.authenticate("admin", "admin")
        admin_user = self.env.ref("base.user_admin")
        notif = self.env["planage.notification"].create({
            "title": "Original Title",
            "message": "msg",
            "user_id": admin_user.id,
        })
        self.make_jsonrpc_request("/planage/notification/write", {
            "notification_id": notif.id,
            "vals": {"read": True, "title": "Hijacked"},
        })
        notif.invalidate_recordset()
        self.assertTrue(notif.is_read)
        self.assertEqual(notif.title, "Original Title")

    def test_export_excel_neutralizes_formula_injection(self):
        self.authenticate("admin", "admin")
        self.task.name = "=cmd|'/c calc'!A1"
        response = self.url_open(
            "/planage/reports/export/excel?project_id=%s" % self.project.id
        )
        self.assertEqual(response.status_code, 200)
        body = response.content.decode("utf-8")
        # The formula must be neutralized with a leading quote so Excel treats
        # it as text, not a live cell value starting with "=".
        self.assertNotIn(",=cmd", body)
        self.assertIn(",'=cmd", body)

    def test_export_pdf_escapes_task_name(self):
        self.authenticate("admin", "admin")
        self.task.name = "<script>alert(1)</script>"
        response = self.url_open(
            "/planage/reports/export/pdf?project_id=%s" % self.project.id
        )
        self.assertEqual(response.status_code, 200)
        body = response.content.decode("utf-8")
        self.assertNotIn("<script>alert(1)</script>", body)
        self.assertIn("&lt;script&gt;", body)

    def test_upload_rejects_oversized_file(self):
        self.authenticate("admin", "admin")
        oversized_payload = base64.b64encode(b"x" * (11 * 1024 * 1024)).decode()
        result = self.make_jsonrpc_request("/planage/document/upload", {
            "task_id": self.task.id,
            "name": "big.bin",
            "datas": oversized_payload,
            "mimetype": "application/octet-stream",
        })
        self.assertIn("error", result)
        self.assertFalse(self.env["planage.document"].search([("name", "=", "big.bin")]))

    def test_download_forces_attachment_for_spoofed_mimetype(self):
        self.authenticate("admin", "admin")
        payload = base64.b64encode(b"<script>alert(document.domain)</script>").decode()
        upload_result = self.make_jsonrpc_request("/planage/document/upload", {
            "task_id": self.task.id,
            "name": "evil.html",
            "datas": payload,
            "mimetype": "text/html",
        })
        self.assertNotIn("error", upload_result)

        response = self.url_open(upload_result["download_url"])
        self.assertEqual(response.status_code, 200)
        # A spoofed "text/html" mimetype must never be served back as HTML
        # inline - that would let it execute script in the Odoo origin.
        self.assertEqual(response.headers.get("Content-Type"), "application/octet-stream")
        self.assertIn("attachment", response.headers.get("Content-Disposition", ""))
        self.assertEqual(response.headers.get("X-Content-Type-Options"), "nosniff")

    def test_download_allows_inline_for_safe_mimetype(self):
        self.authenticate("admin", "admin")
        payload = base64.b64encode(b"\x89PNG\r\n\x1a\n fake png bytes").decode()
        upload_result = self.make_jsonrpc_request("/planage/document/upload", {
            "task_id": self.task.id,
            "name": "photo.png",
            "datas": payload,
            "mimetype": "image/png",
        })
        response = self.url_open(upload_result["download_url"])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("Content-Type"), "image/png")
        self.assertIn("inline", response.headers.get("Content-Disposition", ""))

    def test_get_users_respects_limit(self):
        self.authenticate("admin", "admin")
        for i in range(3):
            self.env["res.users"].create({
                "name": f"Limit Test User {i}",
                "login": f"planage_limit_user_{i}",
            })
        result = self.make_jsonrpc_request("/planage/users", {"limit": 2})
        self.assertEqual(len(result), 2)
