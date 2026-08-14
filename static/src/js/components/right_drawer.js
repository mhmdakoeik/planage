/** @odoo-module **/

import { Component, useState, useRef, onMounted, onWillUnmount, markup } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { showToast } from "../utils/toast";

/**
 * RightDrawer — Contextual task details and comments panel.
 * Opens when a task is clicked. Shows:
 * - Full task properties (title, description, dates, priority, assignees)
 * - Subtask list with add-new capability
 * - Odoo Chatter activity feed (comments, audit trail, attachments)
 * - @mention support
 */
export class RightDrawer extends Component {
    static template = "planage.RightDrawer";

    setup() {
        this.rpc = this.props.state.rpc;
        this.state = useState({
            editingTitle: false,
            editingDescription: false,
            newSubtaskName: "",
            newComment: "",
            subtasks: [],
            messages: [],
            loadingMessages: false,
            showUserDropdown: false,
            showStageDropdown: false,
            newTimesheetName: "",
            newTimesheetDuration: "",
            editingTimesheetId: null,
            editTimesheetName: "",
            editTimesheetDuration: "",
        });
        this.descTextarea = useRef("descTextarea");

        const handleOutsideClick = (ev) => {
            if (this.state.showStageDropdown) {
                const isInside = ev.target.closest('.stage-picker-wrapper');
                if (!isInside) {
                    this.state.showStageDropdown = false;
                }
            }
            if (this.state.showUserDropdown) {
                const isInside = ev.target.closest('.assignee-picker-wrapper');
                if (!isInside) {
                    this.state.showUserDropdown = false;
                }
            }
        };

        onMounted(() => {
            document.addEventListener('click', handleOutsideClick);
        });

        onWillUnmount(() => {
            document.removeEventListener('click', handleOutsideClick);
        });
    }

    get task() {
        return this.props.activeTask;
    }

    get isOpen() {
        return this.props.state.drawerOpen && !!this.task;
    }

    close() {
        this.props.onClose();
    }

    // ─── Dropdown Toggles & Checkers ─────────────────────────────────

    toggleUserDropdown() {
        this.state.showUserDropdown = !this.state.showUserDropdown;
        if (this.state.showUserDropdown) {
            this.state.showStageDropdown = false;
        }
    }

    toggleStageDropdown() {
        this.state.showStageDropdown = !this.state.showStageDropdown;
        if (this.state.showStageDropdown) {
            this.state.showUserDropdown = false;
        }
    }

    isUserAssigned(userId) {
        return (this.task.assignees || []).some((u) => u.id === userId);
    }

    async toggleAssignee(userId) {
        const currentIds = (this.task.assignees || []).map((u) => u.id);
        const index = currentIds.indexOf(userId);
        if (index >= 0) {
            currentIds.splice(index, 1);
        } else {
            currentIds.push(userId);
        }
        await this.props.onWriteTask(this.task.id, {
            assignee_ids: [[6, 0, currentIds]]
        });
    }

    async setStage(stageId) {
        this.state.showStageDropdown = false;
        await this.props.onWriteTask(this.task.id, {
            stage_id: stageId ? parseInt(stageId) : false
        });
    }

    startEditDescription() {
        this.state.editingDescription = true;
    }

    async saveDescription() {
        const el = this.descTextarea.el;
        const newDesc = el ? el.value : "";
        this.state.editingDescription = false;
        if (newDesc !== this.plainDescription) {
            await this.props.onWriteTask(this.task.id, { description: newDesc });
        }
    }

    cancelDescription() {
        this.state.editingDescription = false;
    }

    get plainDescription() {
        if (!this.task || !this.task.description) return "";
        const temp = document.createElement("div");
        temp.innerHTML = this.task.description;
        return temp.textContent || temp.innerText || "";
    }

    get descriptionMarkup() {
        return markup(this.task && this.task.description || "");
    }

    async commitDescription(ev) {
        this.state.editingDescription = false;
        const newDesc = ev.target.value;
        if (newDesc !== this.plainDescription) {
            await this.props.onWriteTask(this.task.id, { description: newDesc });
        }
    }

    // ─── Inline Editing ───────────────────────────────────────────

    startEditTitle() {
        this.state.editingTitle = true;
    }

    async commitTitle(ev) {
        this.state.editingTitle = false;
        const newTitle = ev.target.value.trim();
        if (newTitle && newTitle !== this.task.name) {
            await this.props.onWriteTask(this.task.id, { name: newTitle });
        }
    }

    onTitleKeydown(ev) {
        if (ev.key === "Enter") ev.target.blur();
        if (ev.key === "Escape") this.state.editingTitle = false;
    }

    async setPriority(priority) {
        await this.props.onWriteTask(this.task.id, { priority });
    }

    get dateStartInputValue() {
        return this.task && this.task.date_start ? this.task.date_start.split(" ")[0] : "";
    }

    get dateEndInputValue() {
        return this.task && this.task.date_end ? this.task.date_end.split(" ")[0] : "";
    }

    async onDateStartChange(ev) {
        const val = ev.target.value;
        await this.props.onWriteTask(this.task.id, { date_start: val ? `${val} 00:00:00` : false });
    }

    async onDateEndChange(ev) {
        const val = ev.target.value;
        await this.props.onWriteTask(this.task.id, { date_end: val ? `${val} 00:00:00` : false });
    }

    // ─── Subtasks ─────────────────────────────────────────────────



    // ─── Timesheets ──────────────────────────────────────────────

    async logTime() {
        if (!this.state.newTimesheetName.trim() || !this.state.newTimesheetDuration) {
            this.props.onShowToast?.("Description and duration are required.", "warning");
            return;
        }
        try {
            const today = new Date().toISOString().split('T')[0];
            const updatedTask = await this.rpc("/planage/task/timesheet", {
                task_id: this.task.id,
                date: today,
                name: this.state.newTimesheetName.trim(),
                duration: this.state.newTimesheetDuration
            });
            this.props.onTaskUpdated(updatedTask);
            this.state.newTimesheetName = "";
            this.state.newTimesheetDuration = "";
            this.props.onShowToast?.("Time logged successfully!", "success");
        } catch (e) {
            this.props.onShowToast?.("Failed to log time.", "error");
        }
    }

    startEditTimesheet(ts) {
        this.state.editingTimesheetId = ts.id;
        this.state.editTimesheetName = ts.name;
        this.state.editTimesheetDuration = ts.duration;
    }

    cancelEditTimesheet() {
        this.state.editingTimesheetId = null;
    }

    async saveEditTimesheet(ts) {
        if (!this.state.editTimesheetName.trim() || !this.state.editTimesheetDuration) {
            this.props.onShowToast?.("Description and duration are required.", "warning");
            return;
        }
        try {
            const updatedTask = await this.rpc("/planage/timesheet/write", {
                timesheet_id: ts.id,
                name: this.state.editTimesheetName.trim(),
                duration: this.state.editTimesheetDuration,
            });
            this.props.onTaskUpdated(updatedTask);
            this.state.editingTimesheetId = null;
            this.props.onShowToast?.("Timesheet updated!", "success");
        } catch (e) {
            this.props.onShowToast?.("Failed to update timesheet.", "error");
        }
    }

    // ─── Activity / Chatter ─────────────────────────────────────────────────

    get subtasks() {
        if (!this.task) return [];
        const allTasks = this.props.state.tasks || [];
        return allTasks.filter((t) => t.parent_id === this.task.id);
    }

    async addSubtask() {
        const name = this.state.newSubtaskName.trim();
        if (!name || !this.task) return;
        try {
            await this.rpc("/planage/task/create", {
                project_id: this.task.project_id || this.props.state.activeProjectId,
                name,
                parent_id: this.task.id,
            });
            this.state.newSubtaskName = "";
            // Refresh tasks for the current project
            const tasks = await this.rpc("/planage/tasks", { project_id: this.task.project_id || this.props.state.activeProjectId });
            this.props.state.tasks = tasks;
        } catch (e) {
            console.error("Failed to create subtask", e);
            showToast(this.props.state, _t("Failed to create subtask."), "error");
        }
    }

    onSubtaskKeydown(ev) {
        if (ev.key === "Enter") this.addSubtask();
    }

    get priorityLabel() {
        const labels = { "0": "Low", "1": "Medium", "2": "High", "3": "Urgent" };
        return labels[this.task?.priority] || "Low";
    }

    get priorityClass() {
        const classes = {
            "0": "priority-low",
            "1": "priority-medium",
            "2": "priority-high",
            "3": "priority-urgent",
        };
        return classes[this.task?.priority] || "priority-low";
    }

    async onQuickAddStageKeydown(ev) {
        if (ev.key === "Enter") {
            const name = ev.target.value.trim();
            if (!name) return;
            const activeProjectId = this.props.state.activeProjectId;
            if (!activeProjectId) {
                showToast(this.props.state, _t("Please select a project first."), "error");
                return;
            }
            try {
                const colors = ["#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
                const color = colors[Math.floor(Math.random() * colors.length)];
                const newStage = await this.rpc("/planage/stage/create", {
                    project_id: activeProjectId,
                    name: name,
                    color: color
                });
                this.props.state.stages.push(newStage);
                ev.target.value = "";
            } catch (err) {
                console.error("Failed to create stage", err);
                showToast(this.props.state, _t("Failed to create stage."), "error");
            }
        }
    }

    getTaskDocuments() {
        if (!this.task) return [];
        return (this.props.state.documents || []).filter(
            (doc) => doc.task_id === this.task.id
        );
    }

    async onUploadFile(ev) {
        const file = ev.target.files[0];
        if (!file || !this.task) return;

        const reader = new FileReader();
        reader.onload = async () => {
            const base64Data = reader.result;
            try {
                const result = await this.rpc("/planage/document/upload", {
                    task_id: this.task.id,
                    name: file.name,
                    datas: base64Data,
                    mimetype: file.type,
                });
                ev.target.value = "";
                if (result && result.error) {
                    showToast(this.props.state, result.error, "error");
                    return;
                }
                if (this.props.onLoadDocuments) {
                    await this.props.onLoadDocuments();
                }
            } catch (e) {
                console.error("Failed to upload file", e);
                showToast(this.props.state, _t("Failed to upload file."), "error");
            }
        };
        reader.readAsDataURL(file);
    }

    async deleteDocument(docId) {
        try {
            await this.rpc("/planage/document/delete", { doc_id: docId });
            if (this.props.onLoadDocuments) {
                await this.props.onLoadDocuments();
            }
        } catch (e) {
            console.error("Failed to delete document", e);
            showToast(this.props.state, _t("Failed to delete document."), "error");
        }
    }
}
