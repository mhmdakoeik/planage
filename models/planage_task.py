# -*- coding: utf-8 -*-
from odoo import models, fields, api


class PlanageStage(models.Model):
    """
    Status Tags for tasks. Each project can have its own stage pipeline.
    """
    _name = "planage.stage"
    _description = "Planage Task Stage"
    _order = "sequence, name"

    name = fields.Char(string="Stage Name", required=True)
    color = fields.Char(string="Color (Hex)", default="#3b82f6")
    sequence = fields.Integer(string="Sequence", default=10)
    is_closed = fields.Boolean(
        string="Closing Stage",
        help="Tasks in this stage are counted as 'done' for progress calculations.",
        default=False,
    )
    project_id = fields.Many2one(
        "planage.project",
        string="Project",
        help="Scope stage to a specific project. If empty, it is a global stage.",
        ondelete="cascade",
    )


class PlanageTimesheet(models.Model):
    _name = "planage.timesheet"
    _description = "Planage Task Timesheet"
    _order = "date desc, id desc"

    task_id = fields.Many2one("planage.task", string="Task", required=True, ondelete="cascade")
    project_id = fields.Many2one("planage.project", related="task_id.project_id", store=True, string="Project")
    user_id = fields.Many2one("res.users", string="User", default=lambda self: self.env.user, required=True)
    date = fields.Date(string="Date", default=fields.Date.context_today, required=True)
    name = fields.Char(string="Description", required=True)
    duration = fields.Float(string="Duration (Hours)", required=True)

class PlanageTask(models.Model):
    """
    The core interactive Task card entity.
    Supports inline editing, multi-level subtasks, multi-assignees, priorities,
    and rich-text description via mail.thread integration.
    """
    _name = "planage.task"
    _description = "Planage Task"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "sequence, date_end"
    _rec_name = "name"

    # ─── Core Identity ───────────────────────────────────────────
    name = fields.Char(string="Task Title", required=True, tracking=True)
    description = fields.Html(string="Description")
    color = fields.Char(string="Color (Hex)", default="#6366f1")
    sequence = fields.Integer(string="Sequence", default=10)
    active = fields.Boolean(default=True)

    # ─── Hierarchy ───────────────────────────────────────────────
    project_id = fields.Many2one("planage.project", string="Project", required=True, ondelete="cascade")
    space_id = fields.Many2one(
        "planage.space",
        string="Space",
        related="project_id.space_id",
        store=True,
    )
    parent_id = fields.Many2one(
        "planage.task",
        string="Parent Task",
        ondelete="cascade",
        index=True,
    )
    child_ids = fields.One2many("planage.task", "parent_id", string="Subtasks")
    document_ids = fields.One2many("planage.document", "task_id", string="Documents")
    
    # Timesheets
    timesheet_ids = fields.One2many("planage.timesheet", "task_id", string="Timesheets")
    total_hours = fields.Float(string="Total Hours", compute="_compute_total_hours", store=True)

    @api.depends("timesheet_ids.duration")
    def _compute_total_hours(self):
        for task in self:
            task.total_hours = sum(task.timesheet_ids.mapped('duration'))
    subtask_count = fields.Integer(string="Subtask Count", compute="_compute_subtask_count")
    sprint_id = fields.Many2one("planage.sprint", string="Sprint", ondelete="set null")

    # ─── Workflow ─────────────────────────────────────────────────
    stage_id = fields.Many2one(
        "planage.stage",
        string="Stage",
        tracking=True,
        index=True,
    )
    state = fields.Selection(
        [("open", "Open"), ("in_progress", "In Progress"), ("done", "Done"), ("cancelled", "Cancelled")],
        string="State",
        default="open",
        tracking=True,
    )
    priority = fields.Selection(
        [("0", "Low"), ("1", "Medium"), ("2", "High"), ("3", "Urgent")],
        string="Priority",
        default="0",
        tracking=True,
    )

    # ─── Assignment & Dates ───────────────────────────────────────
    assignee_ids = fields.Many2many(
        "res.users",
        "planage_task_assignee_rel",
        "task_id",
        "user_id",
        string="Assignees",
        tracking=True,
    )
    user_id = fields.Many2one(
        "res.users",
        string="Responsible",
        default=lambda self: self.env.user,
        tracking=True,
    )
    date_start = fields.Datetime(string="Start Date", tracking=True)
    date_end = fields.Datetime(string="End Date", tracking=True)
    date_done = fields.Datetime(string="Completion Date", readonly=True)

    # ─── Progress ─────────────────────────────────────────────────
    progress = fields.Float(string="Progress (%)", default=0.0, digits=(5, 2))

    @api.depends("child_ids")
    def _compute_subtask_count(self):
        for task in self:
            task.subtask_count = len(task.child_ids)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if not vals.get("stage_id") and vals.get("project_id"):
                first_stage = self.env["planage.stage"].search([("project_id", "=", vals["project_id"])], order="sequence, id", limit=1)
                if first_stage:
                     vals["stage_id"] = first_stage.id
        tasks = super(PlanageTask, self).create(vals_list)
        for task in tasks:
            for assignee in task.assignee_ids:
                self.env["planage.notification"].create({
                    "title": "Task Assigned to You",
                    "message": f"You have been assigned to the Task '{task.name}'.",
                    "user_id": assignee.id,
                    "type": "assignment",
                })
        return tasks

    def write(self, vals):
        if "assignee_ids" in vals:
            for task in self:
                old_assignees = task.assignee_ids.ids
                super(PlanageTask, task).write(vals)
                new_assignees = task.assignee_ids.ids
                added = set(new_assignees) - set(old_assignees)
                for user_id in added:
                    self.env["planage.notification"].create({
                        "title": "Task Assigned to You",
                        "message": f"You have been assigned to the Task '{task.name}'.",
                        "user_id": user_id,
                        "type": "assignment",
                    })
        else:
            super(PlanageTask, self).write(vals)
        return True

    def action_set_done(self):
        self.write({"state": "done", "date_done": fields.Datetime.now()})

    def action_reopen(self):
        self.write({"state": "open", "date_done": False})



class PlanageChatMessage(models.Model):
    _name = "planage.chat.message"
    _description = "Planage Chat Message"
    _order = "create_date asc"

    project_id = fields.Many2one("planage.project", string="Project", required=True, ondelete="cascade")
    author_id = fields.Many2one("res.users", string="Author", default=lambda self: self.env.user, required=True)
    body = fields.Text(string="Message Body", required=True)
    is_assigned = fields.Boolean(string="Is Assigned", default=False)
    attachment_name = fields.Char(string="Attachment Name")

    @api.model_create_multi
    def create(self, vals_list):
        records = super(PlanageChatMessage, self).create(vals_list)
        for rec in records:
            if rec.attachment_name:
                tag_audio = self.env["planage.document.tag"].search([("name", "=", "Audio")], limit=1)
                if not tag_audio:
                    tag_audio = self.env["planage.document.tag"].create({"name": "Audio", "color": "#7c3aed"})
                
                tag_draft = self.env["planage.document.tag"].search([("name", "=", "Draft")], limit=1)
                if not tag_draft:
                    tag_draft = self.env["planage.document.tag"].create({"name": "Draft", "color": "#f59e0b"})

                self.env["planage.document"].create({
                    "name": rec.attachment_name,
                    "project_id": rec.project_id.id,
                    "chat_message_id": rec.id,
                    "tag_ids": [(6, 0, [tag_audio.id, tag_draft.id])],
                })

            # Create mention notifications for project members mentioned as @Name
            if rec.body:
                project = rec.project_id
                for member in project.user_ids:
                    # Avoid notifying the author themselves
                    if member.id != rec.author_id.id:
                        mention_tag = f"@{member.name}"
                        if mention_tag in rec.body:
                            self.env["planage.notification"].create({
                                "title": "Mentioned in Sprint Chat",
                                "message": f"{rec.author_id.name} mentioned you in project '{project.name}': {rec.body}",
                                "user_id": member.id,
                                "type": "mention",
                            })
        return records


class PlanageDocumentTag(models.Model):
    _name = "planage.document.tag"
    _description = "Planage Document Tag"

    name = fields.Char(required=True)
    color = fields.Char(default="#3b82f6")


class PlanageDocument(models.Model):
    _name = "planage.document"
    _description = "Planage Uploaded Document"
    _order = "create_date desc"

    name = fields.Char(string="Document Name", required=True)
    project_id = fields.Many2one("planage.project", string="Project", ondelete="cascade")
    chat_message_id = fields.Many2one("planage.chat.message", string="Chat Message", ondelete="cascade")
    tag_ids = fields.Many2many("planage.document.tag", string="Tags")
    task_id = fields.Many2one("planage.task", string="Task", ondelete="cascade")
    datas = fields.Binary(string="File Content")
    mimetype = fields.Char(string="Mime Type")



class PlanageNotification(models.Model):
    _name = "planage.notification"
    _description = "Planage Notification"
    _order = "create_date desc"
    _rec_name = "title"

    title = fields.Char(string="Title", required=True)
    message = fields.Text(string="Message", required=True)
    user_id = fields.Many2one("res.users", string="Recipient User", required=True, ondelete="cascade")
    is_read = fields.Boolean(string="Read", default=False)
    type = fields.Selection([
        ("assignment", "Assignment"),
        ("mention", "Mention"),
        ("milestone", "Milestone"),
        ("system", "System"),
        ("inbox", "Inbox")
    ], string="Type", default="assignment")


class PlanageInboxChannel(models.Model):
    _name = "planage.inbox.channel"
    _description = "Planage Inbox Channel / Conversation"
    _order = "channel_type desc, name asc, id asc"

    name = fields.Char(string="Name")
    channel_type = fields.Selection([
        ("public", "Public Channel"),
        ("private", "Private Channel"),
        ("dm", "Direct Message")
    ], string="Type", default="public", required=True)
    member_ids = fields.Many2many("res.users", "planage_inbox_channel_res_users_rel", "channel_id", "user_id", string="Members")
    message_ids = fields.One2many("planage.inbox.message", "channel_id", string="Messages")


class PlanageInboxMessage(models.Model):
    _name = "planage.inbox.message"
    _description = "Planage Global Inbox Message"
    _order = "create_date asc"

    channel_id = fields.Many2one("planage.inbox.channel", string="Channel", required=True, ondelete="cascade")
    author_id = fields.Many2one("res.users", string="Author", default=lambda self: self.env.user, required=True)
    body = fields.Text(string="Message Body", required=True)

    @api.model_create_multi
    def create(self, vals_list):
        records = super(PlanageInboxMessage, self).create(vals_list)
        for rec in records:
            if rec.body:
                channel = rec.channel_id
                if channel.channel_type == "public":
                    users_to_check = self.env["res.users"].search([])
                else:
                    users_to_check = channel.member_ids

                for member in users_to_check:
                    if member.id != rec.author_id.id:
                        mention_tag = f"@{member.name}"
                        chan_name = channel.name or "Conversation"
                        if channel.channel_type == "dm":
                            chan_name = "Direct Message"
                            
                        is_mentioned = mention_tag in rec.body
                        
                        if is_mentioned:
                            title = "Mentioned in Inbox Channel"
                            msg_text = f"{rec.author_id.name} mentioned you in channel '{chan_name}': {rec.body}"
                        else:
                            title = "New Inbox Message"
                            msg_text = f"{rec.author_id.name} sent a message in '{chan_name}': {rec.body}"
                            
                        self.env["planage.notification"].create({
                            "title": title,
                            "message": msg_text,
                            "user_id": member.id,
                            "type": "inbox",
                        })
        return records

