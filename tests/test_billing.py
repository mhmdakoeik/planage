# -*- coding: utf-8 -*-
from odoo.exceptions import UserError
from odoo.tests.common import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestPlanageBilling(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.space = cls.env["planage.space"].create({"name": "Billing Space"})
        cls.partner = cls.env["res.partner"].create({"name": "Billing Client"})
        cls.project = cls.env["planage.project"].create({
            "name": "Billable Project",
            "space_id": cls.space.id,
            "is_billable": True,
            "hourly_rate": 100.0,
            "partner_id": cls.partner.id,
        })
        cls.task = cls.env["planage.task"].create({
            "name": "Billable Task",
            "project_id": cls.project.id,
        })
        cls.env["planage.timesheet"].create({
            "task_id": cls.task.id,
            "name": "Worked",
            "duration": 3.0,
        })

    def test_create_invoice_generates_move_with_lines(self):
        action = self.project.action_create_invoice()
        invoice = self.env["account.move"].browse(action["res_id"])
        self.assertEqual(invoice.move_type, "out_invoice")
        self.assertEqual(invoice.partner_id, self.partner)
        self.assertEqual(invoice.planage_project_id, self.project)
        self.assertEqual(len(invoice.invoice_line_ids), 1)
        self.assertEqual(invoice.invoice_line_ids.quantity, 3.0)
        self.assertEqual(invoice.invoice_line_ids.price_unit, 100.0)

    def test_create_invoice_requires_billable(self):
        self.project.is_billable = False
        with self.assertRaises(UserError):
            self.project.action_create_invoice()

    def test_create_invoice_requires_partner(self):
        self.project.partner_id = False
        with self.assertRaises(UserError):
            self.project.action_create_invoice()

    def test_create_invoice_requires_logged_hours(self):
        self.env["planage.timesheet"].search([("task_id", "=", self.task.id)]).unlink()
        with self.assertRaises(UserError):
            self.project.action_create_invoice()

    def test_create_invoice_blocked_while_draft_exists(self):
        self.project.action_create_invoice()
        self.assertTrue(self.project.has_draft_invoice)
        with self.assertRaises(UserError):
            self.project.action_create_invoice()

    def test_update_invoice_syncs_latest_hours(self):
        action = self.project.action_create_invoice()
        invoice = self.env["account.move"].browse(action["res_id"])
        self.assertEqual(invoice.invoice_line_ids.quantity, 3.0)

        self.env["planage.timesheet"].create({
            "task_id": self.task.id,
            "name": "More work",
            "duration": 2.0,
        })
        self.project.action_update_invoice()
        self.assertEqual(len(invoice.invoice_line_ids), 1)
        self.assertEqual(invoice.invoice_line_ids.quantity, 5.0)

    def test_update_invoice_requires_existing_draft(self):
        with self.assertRaises(UserError):
            self.project.action_update_invoice()

    def test_posted_invoice_cannot_be_reset_to_draft(self):
        action = self.project.action_create_invoice()
        invoice = self.env["account.move"].browse(action["res_id"])
        invoice.action_post()
        with self.assertRaises(UserError):
            invoice.button_draft()

    def test_new_invoice_allowed_after_posting(self):
        action = self.project.action_create_invoice()
        invoice = self.env["account.move"].browse(action["res_id"])
        invoice.action_post()
        self.assertFalse(self.project.has_draft_invoice)

        self.env["planage.timesheet"].create({
            "task_id": self.task.id,
            "name": "New billing cycle",
            "duration": 1.0,
        })
        action2 = self.project.action_create_invoice()
        self.assertNotEqual(action2["res_id"], invoice.id)
