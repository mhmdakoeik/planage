from odoo import models, fields, _
from odoo.exceptions import UserError


class AccountMove(models.Model):
    _inherit = "account.move"

    planage_project_id = fields.Many2one("planage.project", string="Planage Project")

    def button_draft(self):
        for move in self:
            if move.planage_project_id and move.state == "posted":
                raise UserError(_(
                    "This invoice was generated from a Planage project and cannot be reset "
                    "to draft or edited once posted."
                ))
        return super().button_draft()
