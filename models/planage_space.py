# -*- coding: utf-8 -*-
from odoo import models, fields, api, _
from odoo.exceptions import UserError


class PlanageSpace(models.Model):
    """
    Root organizational layer within a Workspace.
    Represents a high-level department or workflow (e.g., Development, Marketing).
    """
    _name = "planage.space"
    _description = "Planage Space"
    _order = "sequence, name"
    _rec_name = "name"

    name = fields.Char(string="Space Name", required=True)
    color = fields.Char(string="Color (Hex)", default="#6366f1")
    icon = fields.Char(string="Icon (emoji or class)", default="🚀")
    sequence = fields.Integer(string="Sequence", default=10)
    folder_ids = fields.One2many("planage.folder", "space_id", string="Folders")
    project_ids = fields.One2many("planage.project", "space_id", string="Projects")
    task_count = fields.Integer(string="Total Tasks", compute="_compute_task_count")
    active = fields.Boolean(default=True)
    user_ids = fields.Many2many(
        "res.users",
        "planage_space_user_rel",
        "space_id",
        "user_id",
        string="Assigned Employees/Users",
    )

    @api.depends("project_ids.task_ids")
    def _compute_task_count(self):
        for space in self:
            space.task_count = sum(len(proj.task_ids) for proj in space.project_ids)

    def write(self, vals):
        if "user_ids" in vals:
            for space in self:
                old_user_ids = space.user_ids.ids
                super(PlanageSpace, space).write(vals)
                new_user_ids = space.user_ids.ids
                added = set(new_user_ids) - set(old_user_ids)
                for user_id in added:
                    self.env["planage.notification"].create({
                        "title": "Workspace Assigned",
                        "message": f"You have been assigned to the Workspace Space '{space.name}'.",
                        "user_id": user_id,
                        "type": "assignment",
                    })
        else:
            super(PlanageSpace, self).write(vals)
        return True


class PlanageFolder(models.Model):
    """
    Optional grouping within a Space to organize Projects.
    """
    _name = "planage.folder"
    _description = "Planage Folder"
    _order = "sequence, name"

    name = fields.Char(string="Folder Name", required=True)
    space_id = fields.Many2one("planage.space", string="Space", required=True, ondelete="cascade")
    project_id = fields.Many2one("planage.project", string="Project", required=True, ondelete="cascade")
    sprint_ids = fields.One2many("planage.sprint", "folder_id", string="Sprints")
    sequence = fields.Integer(string="Sequence", default=10)
    color = fields.Char(string="Color (Hex)", default="#8b5cf6")


class PlanageProject(models.Model):
    """
    Core project collection that contains tasks, sprints, and customized pipelines.
    """
    _name = "planage.project"
    _description = "Planage Project"
    _order = "sequence, name"

    name = fields.Char(string="Project Name", required=True)
    space_id = fields.Many2one("planage.space", string="Space", required=True, ondelete="cascade")
    folder_ids = fields.One2many("planage.folder", "project_id", string="Folders")
    sprint_ids = fields.One2many("planage.sprint", "project_id", string="Sprints")
    task_ids = fields.One2many("planage.task", "project_id", string="Tasks")
    color = fields.Char(string="Color (Hex)", default="#3b82f6")
    sequence = fields.Integer(string="Sequence", default=10)
    user_ids = fields.Many2many(
        "res.users",
        "planage_project_user_rel",
        "project_id",
        "user_id",
        string="Assigned Members",
    )

    # Billing Fields
    partner_id = fields.Many2one("res.partner", string="Client")
    is_billable = fields.Boolean(string="Is Billable", default=False)
    hourly_rate = fields.Float(string="Hourly Rate")
    invoice_ids = fields.One2many("account.move", "planage_project_id", string="Invoices")
    timesheet_ids = fields.One2many("planage.timesheet", "project_id", string="Timesheets")
    has_draft_invoice = fields.Boolean(string="Has Draft Invoice", compute="_compute_has_draft_invoice")

    @api.depends("invoice_ids.state")
    def _compute_has_draft_invoice(self):
        for project in self:
            project.has_draft_invoice = bool(project.invoice_ids.filtered(lambda m: m.state == "draft"))

    @api.model_create_multi
    def create(self, vals_list):
        projects = super(PlanageProject, self).create(vals_list)
        for proj in projects:
            # Auto-populate premium Project Management stages
            self.env["planage.stage"].create([
                {"name": "To Do", "color": "#3b82f6", "sequence": 10, "project_id": proj.id},
                {"name": "In Progress", "color": "#eab308", "sequence": 20, "project_id": proj.id},
                {"name": "Review", "color": "#a855f7", "sequence": 30, "project_id": proj.id},
                {"name": "Done", "color": "#22c55e", "sequence": 40, "is_closed": True, "project_id": proj.id},
            ])
        return projects

    def _get_billing_invoice_lines(self):
        self.ensure_one()
        tasks = self.env["planage.task"].search([("project_id", "=", self.id)])
        invoice_lines = []
        for task in tasks:
            if task.total_hours > 0:
                invoice_lines.append((0, 0, {
                    "name": f"Task: {task.name} ({task.total_hours} hours)",
                    "quantity": task.total_hours,
                    "price_unit": self.hourly_rate or 0.0,
                }))
        return invoice_lines

    def _invoice_form_action(self, invoice):
        return {
            "type": "ir.actions.act_window",
            "name": "Generated Invoice",
            "res_model": "account.move",
            "res_id": invoice.id,
            "view_mode": "form",
            "target": "current",
        }

    def action_create_invoice(self):
        self.ensure_one()
        if not self.is_billable:
            raise UserError(_("This project is not marked as billable."))
        if not self.partner_id:
            raise UserError(_("Please select a Client before generating an invoice."))
        if self.has_draft_invoice:
            raise UserError(_("This project already has an unposted invoice. Update that invoice instead of creating a new one."))

        invoice_lines = self._get_billing_invoice_lines()
        if not invoice_lines:
            raise UserError(_("There are no logged hours on any tasks in this project."))

        invoice = self.env["account.move"].create({
            "move_type": "out_invoice",
            "partner_id": self.partner_id.id,
            "planage_project_id": self.id,
            "invoice_line_ids": invoice_lines,
        })

        return self._invoice_form_action(invoice)

    def action_update_invoice(self):
        self.ensure_one()
        invoice = self.invoice_ids.filtered(lambda m: m.state == "draft")[:1]
        if not invoice:
            raise UserError(_("There is no unposted invoice to update. Use 'Create Invoice' first."))
        if not self.partner_id:
            raise UserError(_("Please select a Client before updating the invoice."))

        invoice_lines = self._get_billing_invoice_lines()
        if not invoice_lines:
            raise UserError(_("There are no logged hours on any tasks in this project."))

        invoice.write({
            "partner_id": self.partner_id.id,
            "invoice_line_ids": [(5, 0, 0)] + invoice_lines,
        })

        return self._invoice_form_action(invoice)

    def write(self, vals):
        if "user_ids" in vals:
            for project in self:
                old_user_ids = project.user_ids.ids
                super(PlanageProject, project).write(vals)
                new_user_ids = project.user_ids.ids
                added = set(new_user_ids) - set(old_user_ids)
                for user_id in added:
                    self.env["planage.notification"].create({
                        "title": "Project Assigned",
                        "message": f"You have been assigned to the Project '{project.name}'.",
                        "user_id": user_id,
                        "type": "assignment",
                    })
        else:
            super(PlanageProject, self).write(vals)
        return True


class PlanageSprint(models.Model):
    """
    Timed sprints containing groups of tasks under a specific project.
    """
    _name = "planage.sprint"
    _description = "Planage Sprint"
    _order = "date_from, name"

    name = fields.Char(string="Sprint Name", required=True)
    project_id = fields.Many2one("planage.project", string="Project", required=True, ondelete="cascade")
    folder_id = fields.Many2one("planage.folder", string="Folder", ondelete="set null")
    date_from = fields.Datetime(string="Start Date", required=True)
    date_to = fields.Datetime(string="End Date", required=True)
    color = fields.Char(string="Color (Hex)", default="#10b981")
    task_ids = fields.One2many("planage.task", "sprint_id", string="Tasks")
