# -*- coding: utf-8 -*-
import json
from odoo import http, fields, _
from odoo.http import request
from odoo.tools import config


class PlanageController(http.Controller):
    """
    JSON-RPC endpoints for the Planage OWL SPA.
    All endpoints return JSON and are called silently by the frontend.
    """

    # Fields the SPA is allowed to set via the write_* endpoints below.
    # Anything outside this list (e.g. project_id, space_id, id) is dropped
    # rather than passed straight through to record.write().
    _SPACE_WRITABLE_FIELDS = {"name", "color", "icon", "sequence", "user_ids"}
    _PROJECT_WRITABLE_FIELDS = {"name", "color", "sequence", "user_ids", "partner_id", "is_billable", "hourly_rate"}
    _SPRINT_WRITABLE_FIELDS = {"name", "date_from", "date_to", "color", "folder_id"}
    _STAGE_WRITABLE_FIELDS = {"name", "color", "sequence", "is_closed"}
    _TASK_WRITABLE_FIELDS = {
        "name", "description", "color", "sequence", "parent_id", "sprint_id",
        "stage_id", "state", "priority", "assignee_ids", "user_id",
        "date_start", "date_end", "progress",
    }
    _NOTIFICATION_WRITABLE_FIELDS = {"read"}

    # Mimetypes it's safe to let the browser render inline. Everything else
    # (including SVG, which can carry <script>) is served as a forced
    # download so a spoofed mimetype can never get script content executed
    # in the Odoo origin.
    _INLINE_SAFE_MIMETYPES = {
        "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/x-icon",
        "application/pdf",
    }
    _MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB

    @staticmethod
    def _filter_vals(vals, allowed_fields):
        return {k: v for k, v in (vals or {}).items() if k in allowed_fields}

    # ─── Permissions ──────────────────────────────────────────────
    
    @http.route("/planage/permissions", type="jsonrpc", auth="user")
    def get_permissions(self):
        user = request.env.user
        return {
            "is_manager": user.has_group("planage.group_planage_manager"),
            "is_admin": user.has_group("planage.group_planage_admin"),
            "dev_mode": bool(config.get("dev_mode")),
        }

    # ─── Spaces ───────────────────────────────────────────────────

    @http.route("/planage/spaces", type="jsonrpc", auth="user")
    def get_spaces(self):
        domain = ["|", ("user_ids", "=", False), ("user_ids", "in", [request.env.user.id])]
        spaces = request.env["planage.space"].search(domain)
        result = []
        for s in spaces:
            projects = []
            for proj in s.project_ids:
                folders = []
                for folder in proj.folder_ids:
                    folders.append({
                        "id": folder.id,
                        "name": folder.name,
                        "color": folder.color,
                        "sprints": [
                            {
                                "id": sprint.id,
                                "name": sprint.name,
                                "color": sprint.color,
                                "date_from": sprint.date_from and str(sprint.date_from) or None,
                                "date_to": sprint.date_to and str(sprint.date_to) or None,
                                "task_count": len(sprint.task_ids),
                            }
                            for sprint in folder.sprint_ids
                        ],
                    })
                
                direct_sprints = [
                    {
                        "id": sprint.id,
                        "name": sprint.name,
                        "color": sprint.color,
                        "date_from": sprint.date_from and str(sprint.date_from) or None,
                        "date_to": sprint.date_to and str(sprint.date_to) or None,
                        "task_count": len(sprint.task_ids),
                    }
                    for sprint in proj.sprint_ids.filtered(lambda sp: not sp.folder_id)
                ]
                
                projects.append({
                    "id": proj.id,
                    "name": proj.name,
                    "color": proj.color,
                    "task_count": len(proj.task_ids),
                    "user_ids": proj.user_ids.ids,
                    "folders": folders,
                    "sprints": direct_sprints,
                    "is_billable": proj.is_billable,
                    "hourly_rate": proj.hourly_rate,
                    "partner_id": proj.partner_id.id or None,
                    "partner_name": proj.partner_id.name or None,
                })
            
            result.append({
                "id": s.id,
                "name": s.name,
                "color": s.color,
                "icon": s.icon,
                "task_count": s.task_count,
                "projects": projects,
                "user_ids": s.user_ids.ids,
            })
        return result

    @http.route("/planage/space/create", type="jsonrpc", auth="user")
    def create_space(self, name, color="#6366f1", icon="🚀", user_ids=None):
        vals = {"name": name, "color": color, "icon": icon}
        if user_ids is not None:
            vals["user_ids"] = [(6, 0, user_ids)]
        else:
            vals["user_ids"] = [(4, request.env.user.id)]
        space = request.env["planage.space"].create(vals)
        return {
            "id": space.id,
            "name": space.name,
            "color": space.color,
            "icon": space.icon,
            "user_ids": space.user_ids.ids,
        }

    @http.route("/planage/space/write", type="jsonrpc", auth="user")
    def write_space(self, space_id, vals):
        space = request.env["planage.space"].browse(space_id)
        if not space.exists():
            return {"error": "Space not found"}
        vals = self._filter_vals(vals, self._SPACE_WRITABLE_FIELDS)
        if "user_ids" in vals:
            vals["user_ids"] = [(6, 0, vals["user_ids"])]
        space.write(vals)
        return {
            "id": space.id,
            "name": space.name,
            "color": space.color,
            "icon": space.icon,
            "user_ids": space.user_ids.ids,
        }

    @http.route("/planage/folder/create", type="jsonrpc", auth="user")
    def create_folder(self, space_id, project_id, name, color="#8b5cf6"):
        folder = request.env["planage.folder"].create({
            "name": name,
            "space_id": int(space_id),
            "project_id": int(project_id),
            "color": color
        })
        return {
            "id": folder.id,
            "name": folder.name,
            "color": folder.color,
            "sprints": []
        }

    @http.route("/planage/project/create", type="jsonrpc", auth="user")
    def create_project(self, space_id, name, color="#3b82f6"):
        vals = {
            "name": name,
            "space_id": int(space_id),
            "color": color
        }
        project = request.env["planage.project"].create(vals)
        return {
            "id": project.id,
            "name": project.name,
            "color": project.color,
            "user_ids": project.user_ids.ids,
            "folders": [],
            "sprints": []
        }

    @http.route("/planage/project/write", type="jsonrpc", auth="user")
    def write_project(self, project_id, vals):
        project = request.env["planage.project"].browse(int(project_id))
        if not project.exists():
            return {"error": "Project not found"}
        vals = self._filter_vals(vals, self._PROJECT_WRITABLE_FIELDS)
        if "user_ids" in vals:
            vals["user_ids"] = [(6, 0, vals["user_ids"])]
        project.write(vals)
        return {
            "id": project.id,
            "name": project.name,
            "color": project.color,
            "user_ids": project.user_ids.ids,
        }

    @http.route("/planage/sprint/create", type="jsonrpc", auth="user")
    def create_sprint(self, project_id, name, date_from, date_to, folder_id=None, color="#10b981"):
        project = request.env["planage.project"].browse(int(project_id))
        if not project.exists():
            return {"error": "Project not found"}
        
        if date_from and isinstance(date_from, str):
            date_from = date_from.replace('T', ' ')
        if date_to and isinstance(date_to, str):
            date_to = date_to.replace('T', ' ')
            
        vals = {
            "name": name,
            "project_id": project.id,
            "date_from": date_from,
            "date_to": date_to,
            "color": color,
        }
        if folder_id:
            vals["folder_id"] = int(folder_id)
            
        sprint = request.env["planage.sprint"].create(vals)
        
        return {
            "id": sprint.id,
            "name": sprint.name,
            "color": sprint.color,
            "date_from": str(sprint.date_from),
            "date_to": str(sprint.date_to),
            "folder_id": sprint.folder_id.id if sprint.folder_id else None,
            "task_count": 0,
        }

    @http.route("/planage/sprint/write", type="jsonrpc", auth="user")
    def write_sprint(self, sprint_id, vals):
        sprint = request.env["planage.sprint"].browse(int(sprint_id))
        if not sprint.exists():
            return {"error": "Sprint not found"}

        vals = self._filter_vals(vals, self._SPRINT_WRITABLE_FIELDS)
        if "date_from" in vals and vals["date_from"] and isinstance(vals["date_from"], str):
            vals["date_from"] = vals["date_from"].replace('T', ' ')
        if "date_to" in vals and vals["date_to"] and isinstance(vals["date_to"], str):
            vals["date_to"] = vals["date_to"].replace('T', ' ')
            
        # Convert folder_id to appropriate values
        if "folder_id" in vals:
            vals["folder_id"] = int(vals["folder_id"]) if vals["folder_id"] else False
            
        sprint.write(vals)
        return {
            "id": sprint.id,
            "name": sprint.name,
            "color": sprint.color,
            "date_from": str(sprint.date_from),
            "date_to": str(sprint.date_to),
            "folder_id": sprint.folder_id.id if sprint.folder_id else None,
        }

    # ─── Tasks ────────────────────────────────────────────────────

    @http.route("/planage/tasks", type="jsonrpc", auth="user")
    def get_tasks(self, project_id=None, sprint_id=None, parent_id=None, assigned_to_me=False):
        domain = []
        if project_id is not None:
            domain.append(("project_id", "=", int(project_id)))
        if sprint_id is not None:
            domain.append(("sprint_id", "=", int(sprint_id)))
        if assigned_to_me:
            domain.append(("assignee_ids", "in", [request.env.user.id]))
        if parent_id:
            domain.append(("parent_id", "=", int(parent_id)))

        tasks = request.env["planage.task"].search(domain)
        return [self._serialize_task(t) for t in tasks]

    @http.route("/planage/task/create", type="jsonrpc", auth="user")
    def create_task(self, project_id=None, name=None, stage_id=None, parent_id=None,
                    priority="0", date_start=None, date_end=None, progress=None, sprint_id=None):
        vals = {
            "name": name,
            "project_id": int(project_id),
            "priority": priority,
        }
        if stage_id:
            vals["stage_id"] = int(stage_id)
        if parent_id:
            vals["parent_id"] = int(parent_id)
        if date_start:
            vals["date_start"] = date_start
        if date_end:
            vals["date_end"] = date_end
        if progress is not None:
            vals["progress"] = progress
        if sprint_id:
            vals["sprint_id"] = int(sprint_id)
        task = request.env["planage.task"].create(vals)
        return self._serialize_task(task)

    @http.route("/planage/task/write", type="jsonrpc", auth="user")
    def write_task(self, task_id, vals):
        task = request.env["planage.task"].browse(task_id)
        if not task.exists():
            return {"error": "Task not found"}
        vals = self._filter_vals(vals, self._TASK_WRITABLE_FIELDS)
        task.write(vals)
        return self._serialize_task(task)

    @http.route("/planage/task/timesheet", type="jsonrpc", auth="user")
    def create_timesheet(self, task_id, date, name, duration):
        task = request.env["planage.task"].browse(int(task_id))
        if not task.exists():
            return {"error": "Task not found"}
        request.env["planage.timesheet"].create({
            "task_id": task.id,
            "date": date,
            "name": name,
            "duration": float(duration),
        })
        return self._serialize_task(task)

    @http.route("/planage/timesheet/write", type="jsonrpc", auth="user")
    def write_timesheet(self, timesheet_id, date=None, name=None, duration=None):
        timesheet = request.env["planage.timesheet"].browse(int(timesheet_id))
        if not timesheet.exists():
            return {"error": "Timesheet entry not found"}
        vals = {}
        if date is not None:
            vals["date"] = date
        if name is not None:
            vals["name"] = name
        if duration is not None:
            vals["duration"] = float(duration)
        if vals:
            timesheet.write(vals)
        return self._serialize_task(timesheet.task_id)

    @http.route("/planage/task/delete", type="jsonrpc", auth="user")
    def delete_task(self, task_id):
        task = request.env["planage.task"].browse(task_id)
        if task.exists():
            task.unlink()
        return {"success": True}

    @http.route("/planage/stages", type="jsonrpc", auth="user")
    def get_stages(self, project_id=None):
        domain = []
        if project_id:
            domain = [("project_id", "=", int(project_id))]
        stages = request.env["planage.stage"].search(domain)
        return [{"id": s.id, "name": s.name, "color": s.color, "is_closed": s.is_closed, "sequence": s.sequence} for s in stages]

    @http.route("/planage/users", type="jsonrpc", auth="user")
    def get_users(self, limit=500, offset=0):
        users = request.env["res.users"].search(
            [("active", "=", True)], order="name", limit=int(limit), offset=int(offset)
        )
        return [{"id": u.id, "name": u.name, "avatar": f"/web/image/res.users/{u.id}/avatar_128"} for u in users]

    @http.route("/planage/partners", type="jsonrpc", auth="user")
    def get_partners(self, limit=500, offset=0):
        partners = request.env["res.partner"].search(
            [("active", "=", True)], order="name", limit=int(limit), offset=int(offset)
        )
        return [{"id": p.id, "name": p.name} for p in partners]

    @http.route("/planage/stage/create", type="jsonrpc", auth="user")
    def create_stage(self, project_id=None, name=None, color="#3b82f6"):
        max_stage = request.env["planage.stage"].search([("project_id", "=", int(project_id))], order="sequence desc", limit=1)
        next_seq = (max_stage.sequence + 10) if max_stage else 10
        stage = request.env["planage.stage"].create({
            "name": name,
            "project_id": int(project_id),
            "color": color,
            "sequence": next_seq,
        })
        return {"id": stage.id, "name": stage.name, "color": stage.color, "is_closed": stage.is_closed, "sequence": stage.sequence}

    @http.route("/planage/stage/write", type="jsonrpc", auth="user")
    def write_stage(self, stage_id, vals):
        stage = request.env["planage.stage"].browse(int(stage_id))
        if stage.exists():
            stage.write(self._filter_vals(vals, self._STAGE_WRITABLE_FIELDS))
        return {"id": stage.id, "name": stage.name, "color": stage.color}

    @http.route("/planage/stage/delete", type="jsonrpc", auth="user")
    def delete_stage(self, stage_id):
        stage = request.env["planage.stage"].browse(int(stage_id))
        if stage.exists():
            stage.unlink()
        return {"success": True}

    # ─── Chat ─────────────────────────────────────────────────────

    @http.route("/planage/chat/messages", type="jsonrpc", auth="user")
    def get_chat_messages(self, project_id=None):
        messages = request.env["planage.chat.message"].search([("project_id", "=", int(project_id))])
        
        # No seeding, just search and return existing chat messages
        pass

        return [
            {
                "id": m.id,
                "body": m.body,
                "author_name": m.author_id.name,
                "author_avatar": f"/web/image/res.users/{m.author_id.id}/avatar_128",
                "create_date": m.create_date.strftime("%b %d, %Y at %I:%M %p") if m.create_date else "",
                "is_assigned": m.is_assigned,
                "attachment_name": m.attachment_name,
            }
            for m in messages
        ]

    @http.route("/planage/chat/message/create", type="jsonrpc", auth="user")
    def create_chat_message(self, project_id=None, body=None, is_assigned=False, attachment_name=None):
        msg = request.env["planage.chat.message"].create({
            "project_id": int(project_id),
            "body": body,
            "is_assigned": is_assigned,
            "attachment_name": attachment_name,
        })
        return {
            "id": msg.id,
            "body": msg.body,
            "author_name": msg.author_id.name,
            "author_avatar": f"/web/image/res.users/{msg.author_id.id}/avatar_128",
            "create_date": msg.create_date.strftime("%b %d, %Y at %I:%M %p") if msg.create_date else "",
            "is_assigned": msg.is_assigned,
            "attachment_name": msg.attachment_name,
        }

    @http.route("/planage/documents", type="jsonrpc", auth="user")
    def get_documents(self, limit=200, offset=0):
        docs = request.env["planage.document"].search([], order="create_date desc", limit=int(limit), offset=int(offset))
        return [
            {
                "id": d.id,
                "name": d.name,
                "project_id": d.project_id.id if d.project_id else None,
                "project_name": d.project_id.name if d.project_id else "",
                "tags": [{"id": t.id, "name": t.name, "color": t.color} for t in d.tag_ids],
                "task_id": d.task_id.id if d.task_id else None,
                "task_name": d.task_id.name if d.task_id else "",
                "mimetype": d.mimetype or "",
                "download_url": f"/planage/document/download/{d.id}" if d.datas else None,
                "create_date": d.create_date.strftime("%b %d, %Y at %I:%M %p") if d.create_date else "",
            }
            for d in docs
        ]

    @http.route("/planage/document/upload", type="jsonrpc", auth="user")
    def upload_document(self, task_id, name, datas, mimetype):
        task = request.env["planage.task"].browse(int(task_id))
        if not task.exists():
            return {"error": "Task not found"}

        if datas and "," in datas:
            datas = datas.split(",")[1]

        if datas:
            # Base64 encodes to ~4/3 the original size; estimate without
            # decoding the whole payload just to check its length.
            estimated_size = (len(datas) * 3) // 4
            if estimated_size > self._MAX_UPLOAD_SIZE_BYTES:
                return {"error": "File is too large. Maximum upload size is 10 MB."}

        # Determine tag (Image or Document)
        is_image = mimetype.startswith("image/") if mimetype else False
        tag_name = "Image" if is_image else "Document"
        tag_color = "#10b981" if is_image else "#3b82f6"
        
        tag = request.env["planage.document.tag"].search([("name", "=", tag_name)], limit=1)
        if not tag:
            tag = request.env["planage.document.tag"].create({"name": tag_name, "color": tag_color})
            
        doc = request.env["planage.document"].create({
            "name": name,
            "project_id": task.project_id.id,
            "task_id": task.id,
            "datas": datas,
            "mimetype": mimetype,
            "tag_ids": [(6, 0, [tag.id])],
        })
        
        return {
            "id": doc.id,
            "name": doc.name,
            "project_id": doc.project_id.id,
            "project_name": doc.project_id.name,
            "tags": [{"id": t.id, "name": t.name, "color": t.color} for t in doc.tag_ids],
            "task_id": doc.task_id.id,
            "task_name": doc.task_id.name,
            "mimetype": doc.mimetype or "",
            "download_url": f"/planage/document/download/{doc.id}",
            "create_date": doc.create_date.strftime("%b %d, %Y at %I:%M %p") if doc.create_date else "",
        }

    @http.route("/planage/document/delete", type="jsonrpc", auth="user")
    def delete_document(self, doc_id):
        doc = request.env["planage.document"].browse(int(doc_id))
        if not doc.exists():
            return {"error": "Document not found"}
        doc.unlink()
        return {"success": True}

    @http.route("/planage/document/download/<int:doc_id>", type="http", auth="user")
    def download_document(self, doc_id):
        doc = request.env["planage.document"].browse(doc_id)
        if not doc.exists() or not doc.datas:
            return request.not_found()
        
        import base64
        import re
        filecontent = base64.b64decode(doc.datas)

        # Strip control characters and quotes so the filename can't break out
        # of the quoted Content-Disposition value or inject extra headers.
        safe_name = re.sub(r'[\r\n"\x00-\x1f]', "_", doc.name or "document")

        # The mimetype is client-supplied at upload time and can be spoofed
        # (e.g. "text/html" with a <script> payload). Only render inline for
        # a strict allowlist of formats that can't execute script in the
        # browser; force a download for everything else regardless of what
        # mimetype was claimed, so a spoofed type can never get rendered.
        is_inline_safe = doc.mimetype in self._INLINE_SAFE_MIMETYPES
        content_type = doc.mimetype if is_inline_safe else "application/octet-stream"
        disposition = "inline" if is_inline_safe else "attachment"

        headers = [
            ("Content-Type", content_type),
            ("X-Content-Type-Options", "nosniff"),
            ("Content-Disposition", f'{disposition}; filename="{safe_name}"'),
            ("Content-Length", len(filecontent)),
        ]
        return request.make_response(filecontent, headers=headers)


    @http.route("/planage/dashboard/filters", type="jsonrpc", auth="user")
    def get_dashboard_filters(self):
        projects = request.env["planage.project"].search([])
        project_data = []
        for p in projects:
            sprints = request.env["planage.sprint"].search([("project_id", "=", p.id)])
            project_data.append({
                "id": p.id,
                "name": p.name,
                "sprints": [{"id": s.id, "name": s.name} for s in sprints]
            })
        return {"projects": project_data}

    @http.route("/planage/dashboard/stats", type="jsonrpc", auth="user")
    def get_dashboard_stats(self, project_id=None, sprint_id=None):
        from datetime import datetime, timedelta, timezone

        domain = []
        if project_id:
            domain.append(("project_id", "=", int(project_id)))
        if sprint_id:
            domain.append(("sprint_id", "=", int(sprint_id)))

        tasks = request.env["planage.task"].search(domain)
        total_tasks = len(tasks)
        total_docs = request.env["planage.document"].search_count([])

        # 1. Dynamic Task Statuses
        stage_counts = {}
        stage_colors = {}
        
        if project_id:
            project_stages = request.env["planage.stage"].search([("project_id", "=", int(project_id))])
            for stg in project_stages:
                stage_counts[stg.name] = 0
                stage_colors[stg.name] = stg.color or "#94a3b8"
                
            for t in tasks:
                sname = t.stage_id.name if t.stage_id else "No Stage"
                scolor = t.stage_id.color if t.stage_id else "#94a3b8"
                stage_counts[sname] = stage_counts.get(sname, 0) + 1
                if sname not in stage_colors:
                    stage_colors[sname] = scolor
        else:
            stage_counts["To Do"] = 0
            stage_colors["To Do"] = "#6366f1"
            stage_counts["Done"] = 0
            stage_colors["Done"] = "#10b981"
            
            for t in tasks:
                if t.stage_id and t.stage_id.is_closed:
                    stage_counts["Done"] += 1
                else:
                    stage_counts["To Do"] += 1

        stage_stats = []
        # Default order to keep it consistent if possible, else alphabetical
        for name, count in stage_counts.items():
            stage_stats.append({
                "name": name,
                "count": count,
                "color": stage_colors.get(name, "#6366f1")
            })

        # 2. Priority breakdown
        urgent_count = sum(1 for t in tasks if t.priority == "3")
        high_count = sum(1 for t in tasks if t.priority == "2")
        normal_count = sum(1 for t in tasks if t.priority == "1")
        low_count = sum(1 for t in tasks if t.priority == "0")

        # 3. Project stats breakdown (filtered if project selected)
        projects = request.env["planage.project"].search([("id", "=", int(project_id))] if project_id else [])
        project_stats = []
        for p in projects:
            p_domain = list(domain)
            if not project_id:
                p_domain.append(("project_id", "=", p.id))
            t_count = request.env["planage.task"].search_count(p_domain)
            
            d_domain = list(p_domain)
            d_domain.append(("state", "=", "done")) # Used state="done" for progress calculation
            d_count = request.env["planage.task"].search_count(d_domain)
            
            project_stats.append({
                "id": p.id,
                "name": p.name,
                "color": p.color or "#4f46e5",
                "task_count": t_count,
                "done_count": d_count,
                "progress": int((d_count / t_count * 100)) if t_count > 0 else 0
            })

        # 4. Tasks created in the last 7 days (for sparkline chart)
        today = datetime.now(timezone.utc).date()
        tasks_by_day = []
        for i in range(6, -1, -1):
            day = today - timedelta(days=i)
            day_start = datetime(day.year, day.month, day.day, 0, 0, 0)
            day_end = datetime(day.year, day.month, day.day, 23, 59, 59)
            
            d_domain = list(domain)
            d_domain.append(("create_date", ">=", day_start.strftime("%Y-%m-%d %H:%M:%S")))
            d_domain.append(("create_date", "<=", day_end.strftime("%Y-%m-%d %H:%M:%S")))
            count = request.env["planage.task"].search_count(d_domain)
            tasks_by_day.append({
                "label": day.strftime("%a"),
                "count": count,
            })

        return {
            "total_tasks": total_tasks,
            "total_docs": total_docs,
            "stage_stats": stage_stats,
            "priorities": {
                "urgent": urgent_count,
                "high": high_count,
                "normal": normal_count,
                "low": low_count,
            },
            "list_stats": project_stats,
            "tasks_by_day": tasks_by_day,
        }

    # ─── Notifications ────────────────────────────────────────────

    @http.route("/planage/notifications", type="jsonrpc", auth="user")
    def get_notifications(self):
        uid = request.env.user.id
        notifications = request.env["planage.notification"].search(
            [("user_id", "=", uid)], order="create_date desc", limit=50
        )
        return [
            {
                "id": n.id,
                "title": n.title,
                "message": n.message,
                "read": n.is_read,
                "type": n.type,
                "time": self._format_notif_time(n.create_date),
            }
            for n in notifications
        ]

    @http.route("/planage/notification/write", type="jsonrpc", auth="user")
    def write_notification(self, notification_id, vals):
        notif = request.env["planage.notification"].browse(int(notification_id))
        if notif.exists() and notif.user_id.id == request.env.user.id:
            filtered = self._filter_vals(vals, self._NOTIFICATION_WRITABLE_FIELDS)
            if "read" in filtered:
                filtered["is_read"] = filtered.pop("read")
            notif.write(filtered)
        return {"success": True}

    @http.route("/planage/notification/mark_all_read", type="jsonrpc", auth="user")
    def mark_all_notifications_read(self):
        uid = request.env.user.id
        unread = request.env["planage.notification"].search(
            [("user_id", "=", uid), ("is_read", "=", False)]
        )
        unread.write({"is_read": True})
        return {"success": True, "count": len(unread)}

    @http.route("/planage/notification/mark_inbox_read", type="jsonrpc", auth="user")
    def mark_inbox_notifications_read(self):
        uid = request.env.user.id
        unread = request.env["planage.notification"].search([
            ("user_id", "=", uid),
            ("type", "=", "inbox"),
            ("is_read", "=", False)
        ])
        unread.write({"is_read": True})
        return {"success": True, "count": len(unread)}


    def _format_notif_time(self, dt):
        if not dt:
            return ""
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        diff = now - dt.replace(tzinfo=timezone.utc)
        seconds = int(diff.total_seconds())
        if seconds < 60:
            return "Just now"
        elif seconds < 3600:
            m = seconds // 60
            return f"{m} min{'s' if m > 1 else ''} ago"
        elif seconds < 86400:
            h = seconds // 3600
            return f"{h} hr{'s' if h > 1 else ''} ago"
        elif seconds < 172800:
            return "Yesterday"
        else:
            d = seconds // 86400
            return f"{d} days ago"

    @http.route("/planage/inbox/channels", type="jsonrpc", auth="user")
    def get_inbox_channels(self):
        user = request.env.user
        domain = [
            "|",
            ("channel_type", "=", "public"),
            ("member_ids", "in", [user.id])
        ]
        channels = request.env["planage.inbox.channel"].search(domain)
        result = []
        for c in channels:
            name = c.name
            avatar = None
            other_user_id = None
            if c.channel_type == "dm":
                other_members = c.member_ids.filtered(lambda m: m.id != user.id)
                if other_members:
                    name = other_members[0].name
                    avatar = f"/web/image/res.users/{other_members[0].id}/avatar_128"
                    other_user_id = other_members[0].id
                else:
                    name = user.name
                    avatar = f"/web/image/res.users/{user.id}/avatar_128"
                    other_user_id = user.id
            result.append({
                "id": c.id,
                "name": name,
                "channel_type": c.channel_type,
                "avatar": avatar,
                "other_user_id": other_user_id,
                "member_ids": c.member_ids.ids,
            })
        is_admin = user.has_group("base.group_system") or user.login == "admin" or request.env.is_admin()
        return {
            "channels": result,
            "is_admin": is_admin
        }

    @http.route("/planage/inbox/channel/leave", type="jsonrpc", auth="user")
    def leave_inbox_channel(self, channel_id):
        user = request.env.user
        channel = request.env["planage.inbox.channel"].browse(int(channel_id))
        if not channel.exists():
            return {"error": "Channel not found."}
        
        if channel.channel_type in ["private", "dm"]:
            channel.write({"member_ids": [(3, user.id)]})
            # If no members left in DM or Private Channel, remove it
            if not channel.member_ids:
                channel.unlink()
        return {"success": True}

    @http.route("/planage/inbox/channel/delete", type="jsonrpc", auth="user")
    def delete_inbox_channel(self, channel_id):
        user = request.env.user
        is_admin = user.has_group("base.group_system") or user.login == "admin" or request.env.is_admin()
        if not is_admin:
            return {"error": "Only admins can delete channels."}
            
        channel = request.env["planage.inbox.channel"].browse(int(channel_id))
        if not channel.exists():
            return {"error": "Channel not found."}
            
        channel.unlink()
        return {"success": True}


    @http.route("/planage/inbox/channel/create", type="jsonrpc", auth="user")
    def create_inbox_channel(self, channel_type, name=None, member_ids=None):
        user = request.env.user
        if not member_ids:
            member_ids = []
        if channel_type in ["private", "dm"] and user.id not in member_ids:
            member_ids.append(user.id)
            
        if channel_type == "dm":
            dm_channels = request.env["planage.inbox.channel"].search([("channel_type", "=", "dm")])
            target_member_set = set(member_ids)
            existing_channel = None
            for c in dm_channels:
                if set(c.member_ids.ids) == target_member_set:
                    existing_channel = c
                    break
            if existing_channel:
                name = existing_channel.name
                avatar = None
                other_user_id = None
                other_members = existing_channel.member_ids.filtered(lambda m: m.id != user.id)
                if other_members:
                    name = other_members[0].name
                    avatar = f"/web/image/res.users/{other_members[0].id}/avatar_128"
                    other_user_id = other_members[0].id
                else:
                    name = user.name
                    avatar = f"/web/image/res.users/{user.id}/avatar_128"
                    other_user_id = user.id
                return {
                    "id": existing_channel.id,
                    "name": name,
                    "channel_type": existing_channel.channel_type,
                    "avatar": avatar,
                    "other_user_id": other_user_id,
                    "member_ids": existing_channel.member_ids.ids,
                }
        
        vals = {
            "channel_type": channel_type,
            "name": name or "",
        }
        if channel_type in ["private", "dm"]:
            vals["member_ids"] = [(6, 0, member_ids)]
            
        channel = request.env["planage.inbox.channel"].create(vals)

        # Send notifications to users assigned to the channel
        if member_ids:
            for m_id in member_ids:
                if m_id != user.id:
                    member_user = request.env["res.users"].browse(m_id)
                    if member_user.exists():
                        if channel.channel_type == "dm":
                            title = "New Direct Message"
                            msg_text = f"{user.name} started a direct conversation with you."
                        else:
                            title = "New Channel Invitation"
                            msg_text = f"You have been added to the private channel '{channel.name}' by {user.name}."
                        
                        request.env["planage.notification"].create({
                            "title": title,
                            "message": msg_text,
                            "user_id": member_user.id,
                            "type": "inbox",
                        })
        
        ret_name = channel.name
        avatar = None
        other_user_id = None
        if channel.channel_type == "dm":
            other_members = channel.member_ids.filtered(lambda m: m.id != user.id)
            if other_members:
                ret_name = other_members[0].name
                avatar = f"/web/image/res.users/{other_members[0].id}/avatar_128"
                other_user_id = other_members[0].id
            else:
                ret_name = user.name
                avatar = f"/web/image/res.users/{user.id}/avatar_128"
                other_user_id = user.id
                
        return {
            "id": channel.id,
            "name": ret_name,
            "channel_type": channel.channel_type,
            "avatar": avatar,
            "other_user_id": other_user_id,
            "member_ids": channel.member_ids.ids,
        }

    @http.route("/planage/inbox/messages", type="jsonrpc", auth="user")
    def get_inbox_messages(self, channel_id):
        user = request.env.user
        channel = request.env["planage.inbox.channel"].browse(int(channel_id))
        if not channel.exists():
            return []
        if channel.channel_type in ["private", "dm"] and user.id not in channel.member_ids.ids:
            return []
            
        # Limit to 100 most recent messages for performance during polling
        messages = request.env["planage.inbox.message"].search([("channel_id", "=", channel.id)], order="create_date desc", limit=100)
        
        # Reverse to chronological order for the frontend
        result = []
        for m in reversed(messages):
            result.append({
                "id": m.id,
                "body": m.body,
                "author_name": m.author_id.name,
                "author_avatar": f"/web/image/res.users/{m.author_id.id}/avatar_128",
                "create_date": m.create_date.strftime("%b %d, %Y at %I:%M %p") if m.create_date else "",
            })
        return result

    @http.route("/planage/inbox/message/create", type="jsonrpc", auth="user")
    def create_inbox_message(self, channel_id, body):
        user = request.env.user
        channel = request.env["planage.inbox.channel"].browse(int(channel_id))
        if not channel.exists():
            raise Exception("Channel not found")
        if channel.channel_type in ["private", "dm"] and user.id not in channel.member_ids.ids:
            raise Exception("Access Denied")
        msg = request.env["planage.inbox.message"].create({
            "channel_id": channel.id,
            "body": body,
        })
        return {
            "id": msg.id,
            "body": msg.body,
            "author_name": msg.author_id.name,
            "author_avatar": f"/web/image/res.users/{msg.author_id.id}/avatar_128",
            "create_date": msg.create_date.strftime("%b %d, %Y at %I:%M %p") if msg.create_date else "",
        }

    @http.route("/planage/reset", type="jsonrpc", auth="user")
    def reset_system(self):
        if not config.get("dev_mode"):
            return {"error": _("System reset is only available in development mode.")}

        user = request.env.user
        is_admin = user.has_group("planage.group_planage_admin") or request.env.is_admin()
        if not is_admin:
            return {"error": "Only Planage administrators can reset the system."}

        request.env["planage.task"].search([]).unlink()
        request.env["planage.sprint"].search([]).unlink()
        request.env["planage.project"].search([]).unlink()
        request.env["planage.folder"].search([]).unlink()
        request.env["planage.space"].search([]).unlink()
        request.env["planage.stage"].search([]).unlink()
        request.env["planage.chat.message"].search([]).unlink()
        request.env["planage.inbox.message"].search([]).unlink()
        request.env["planage.inbox.channel"].search([]).unlink()
        request.env["planage.document"].search([]).unlink()
        request.env["planage.document.tag"].search([]).unlink()
        request.env["planage.notification"].search([]).unlink()
        
        request.env["planage.inbox.channel"].create({"name": "general", "channel_type": "public"})
        request.env["planage.inbox.channel"].create({"name": "Administrators", "channel_type": "public"})
        return {"success": True}

    # ─── Helpers ──────────────────────────────────────────────────

    def _serialize_task(self, task):
        return {
            "id": task.id,
            "name": task.name,
            "description": task.description or "",
            "state": task.state,
            "priority": task.priority,
            "color": task.color,
            "progress": task.progress,
            "stage_id": task.stage_id.id if task.stage_id else None,
            "stage_name": task.stage_id.name if task.stage_id else None,
            "stage_color": task.stage_id.color if task.stage_id else None,
            "project_id": task.project_id.id,
            "project_name": task.project_id.name if task.project_id else "",
            "space_id": task.project_id.space_id.id if task.project_id and task.project_id.space_id else None,
            "space_name": task.project_id.space_id.name if task.project_id and task.project_id.space_id else "",
            "sprint_id": task.sprint_id.id if task.sprint_id else None,
            "parent_id": task.parent_id.id if task.parent_id else None,
            "subtask_count": task.subtask_count,
            "date_start": task.date_start and str(task.date_start) or None,
            "date_end": task.date_end and str(task.date_end) or None,
            "date_done": task.date_done and str(task.date_done) or None,
            "assignees": [
                {"id": u.id, "name": u.name, "avatar": f"/web/image/res.users/{u.id}/avatar_128"}
                for u in task.assignee_ids
            ],
            "user_id": task.user_id.id,
            "user_name": task.user_id.name,
            "total_hours": task.total_hours,
            "timesheets": [
                {
                    "id": ts.id,
                    "date": str(ts.date),
                    "name": ts.name,
                    "duration": ts.duration,
                    "user_name": ts.user_id.name,
                }
                for ts in task.timesheet_ids
            ],
        }

    # ─── Reporting & Export ───────────────────────────────────────

    def _get_reporting_domain(self, kw):
        domain = []
        if kw.get("project_id"):
            domain.append(("project_id", "=", int(kw.get("project_id"))))
        if kw.get("sprint_id"):
            domain.append(("sprint_id", "=", int(kw.get("sprint_id"))))
            
        if kw.get("week"):
            try:
                import datetime
                # HTML <input type="week"> format is "YYYY-Www" (e.g. 2026-W27)
                year, week = kw["week"].split("-W")
                # Parse to get the Monday of that ISO week
                start_of_week = datetime.datetime.strptime(f"{year}-W{week}-1", "%G-W%V-%u")
                end_of_week = start_of_week + datetime.timedelta(days=7)
                domain.append(("create_date", ">=", start_of_week))
                domain.append(("create_date", "<", end_of_week))
            except Exception as e:
                pass

        if kw.get("month"):
            try:
                import datetime
                import calendar
                # HTML <input type="month"> format is "YYYY-MM" (e.g. 2026-07)
                year, month = kw["month"].split("-")
                start_of_month = datetime.datetime(int(year), int(month), 1)
                days_in_month = calendar.monthrange(int(year), int(month))[1]
                end_of_month = start_of_month + datetime.timedelta(days=days_in_month)
                domain.append(("create_date", ">=", start_of_month))
                domain.append(("create_date", "<", end_of_month))
            except Exception as e:
                pass
        return domain

    @http.route("/planage/reports/data", type="jsonrpc", auth="user")
    def get_reporting_data(self, **kw):
        domain = self._get_reporting_domain(kw)
        tasks = request.env["planage.task"].search(domain)
        now = fields.Datetime.now()

        project_workload_dict = {}
        assignee_workload_dict = {}
        stage_counts = {}
        stage_colors = {}
        late_tasks = []

        for t in tasks:
            # 1. Project Workload
            if t.project_id:
                pid = t.project_id.id
                if pid not in project_workload_dict:
                    project_workload_dict[pid] = {
                        "id": pid,
                        "name": t.project_id.name,
                        "space_name": t.project_id.space_id.name if t.project_id.space_id else "",
                        "total_tasks": 0,
                    }
                project_workload_dict[pid]["total_tasks"] += 1

            # 2. Assignee Workload
            is_done = t.stage_id and t.stage_id.is_closed
            if t.assignee_ids:
                for u in t.assignee_ids:
                    uid = u.id
                    if uid not in assignee_workload_dict:
                        assignee_workload_dict[uid] = {
                            "id": uid,
                            "name": u.name,
                            "total_tasks": 0,
                            "open_tasks": 0,
                            "done_tasks": 0,
                        }
                    assignee_workload_dict[uid]["total_tasks"] += 1
                    if is_done:
                        assignee_workload_dict[uid]["done_tasks"] += 1
                    else:
                        assignee_workload_dict[uid]["open_tasks"] += 1

            # 3. Stage Pipeline
            sname = t.stage_id.name if t.stage_id else "No Stage"
            scolor = t.stage_id.color if t.stage_id else "#94a3b8"
            stage_counts[sname] = stage_counts.get(sname, 0) + 1
            if sname not in stage_colors:
                stage_colors[sname] = scolor

            # 4. Late Tasks
            if not is_done and t.date_end:
                if t.date_end < now:
                    delta = now - t.date_end
                    days_late = delta.days + 1
                    if days_late >= 1:
                        late_tasks.append({
                            "id": t.id,
                            "name": t.name,
                            "project_name": t.project_id.name if t.project_id else "",
                            "assignees": ", ".join(t.assignee_ids.mapped("name")),
                            "stage_name": sname,
                            "stage_color": scolor,
                            "date_end": str(t.date_end.date()),
                            "days_late": days_late,
                        })

        project_workload = list(project_workload_dict.values())
        project_workload.sort(key=lambda x: x["total_tasks"], reverse=True)

        assignee_workload = list(assignee_workload_dict.values())
        assignee_workload.sort(key=lambda x: x["total_tasks"], reverse=True)

        total_tasks = len(tasks)
        stage_pipeline = []
        for name, count in stage_counts.items():
            pct = round((count / total_tasks) * 100) if total_tasks > 0 else 0
            stage_pipeline.append({
                "name": name,
                "count": count,
                "percentage": pct,
                "color": stage_colors.get(name, "#94a3b8")
            })
        stage_pipeline.sort(key=lambda x: x["count"], reverse=True)
        
        late_tasks.sort(key=lambda x: x["days_late"], reverse=True)

        return {
            "project_workload": project_workload,
            "assignee_workload": assignee_workload,
            "stage_pipeline": stage_pipeline,
            "late_tasks": late_tasks
        }

    @http.route("/planage/reports/export/excel", type="http", auth="user")
    def export_excel(self, **kw):
        import csv
        import io

        def csv_safe(value):
            text = "" if value is None else str(value)
            if text and text[0] in ("=", "+", "-", "@", "\t", "\r"):
                return "'" + text
            return text

        output = io.StringIO()
        writer = csv.writer(output)

        # Headers
        writer.writerow(["Task ID", "Task Name", "Project", "Space", "Stage", "Assignees", "Deadline", "State", "Progress"])

        domain = self._get_reporting_domain(kw)
        tasks = request.env["planage.task"].search(domain)
        for t in tasks:
            writer.writerow([
                t.id,
                csv_safe(t.name),
                csv_safe(t.project_id.name if t.project_id else ""),
                csv_safe(t.project_id.space_id.name if t.project_id and t.project_id.space_id else ""),
                csv_safe(t.stage_id.name if t.stage_id else ""),
                csv_safe(", ".join(t.assignee_ids.mapped("name"))),
                str(t.date_end.date()) if t.date_end else "",
                t.state or "",
                f"{t.progress}%"
            ])
            
        csv_data = output.getvalue()
        
        return request.make_response(
            csv_data,
            headers=[
                ("Content-Type", "text/csv"),
                ("Content-Disposition", 'attachment; filename="Planage_Tasks_Report.csv"'),
            ]
        )

    @http.route("/planage/reports/export/pdf", type="http", auth="user")
    def export_pdf(self, **kw):
        import html as html_lib

        domain = self._get_reporting_domain(kw)
        tasks = request.env["planage.task"].search(domain, order="date_end asc")

        html = """
        <html>
        <head>
            <title>Planage Tasks Report</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
                th { background-color: #f2f2f2; }
                h1 { color: #333; margin-bottom: 5px; }
                .late { color: #ef4444; font-weight: bold; }
                @media print {
                    @page { margin: 1cm; }
                    button { display: none; }
                }
            </style>
        </head>
        <body onload="window.print()">
            <button onclick="window.print()" style="padding: 10px 20px; margin-bottom: 20px; cursor: pointer; background: #6366f1; color: white; border: none; border-radius: 6px;">Print to PDF</button>
            <h1>Planage Managerial Tasks Report</h1>
            <p style="color: #666; margin-top: 0;">Generated on: {date}</p>
            <table>
                <thead>
                    <tr>
                        <th>Task Name</th>
                        <th>Project</th>
                        <th>Stage</th>
                        <th>Assignees</th>
                        <th>Deadline</th>
                    </tr>
                </thead>
                <tbody>
        """.replace("{date}", html_lib.escape(fields.Datetime.now().strftime("%Y-%m-%d %H:%M")))

        now = fields.Datetime.now()
        for t in tasks:
            is_late = False
            if t.date_end and t.date_end < now and not (t.stage_id and t.stage_id.is_closed):
                is_late = True
                
            html += """
                <tr>
                    <td>{name}</td>
                    <td>{project}</td>
                    <td>{stage}</td>
                    <td>{assignees}</td>
                    <td class="{late_cls}">{date_end}</td>
                </tr>
            """.format(
                name=html_lib.escape(t.name or ""),
                project=html_lib.escape(t.project_id.name if t.project_id else ""),
                stage=html_lib.escape(t.stage_id.name if t.stage_id else ""),
                assignees=html_lib.escape(", ".join(t.assignee_ids.mapped("name"))),
                late_cls="late" if is_late else "",
                date_end=html_lib.escape(str(t.date_end.date()) if t.date_end else ""),
            )
            
        html += """
                </tbody>
            </table>
        </body>
        </html>
        """
        
        return request.make_response(
            html,
            headers=[("Content-Type", "text/html")]
        )
