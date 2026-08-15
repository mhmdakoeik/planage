/** @odoo-module **/

import { Component, useState } from "@odoo/owl";

// Rendering hundreds of kanban cards in one column at once is what makes
// large projects feel sluggish; cap what's rendered and let the user reveal
// more on demand instead.
const CARDS_PER_PAGE = 30;

/**
 * BoardView — Kanban board view.
 * Columns map directly to Status Stages.
 * Uses HTML5 drag-and-drop to patch stage_id silently.
 */
export class BoardView extends Component {
    static template = "planage.BoardView";

    setup() {
        this.state = useState({
            dragTaskId: null,
            dragOverStageId: null,
            newTaskNames: {},
            visibleCounts: {},
        });
    }

    get columns() {
        const stages = this.props.stages || [];
        const tasks = this.props.tasks || [];
        const cols = stages.map((s) => ({ ...s, tasks: [] }));

        for (const task of tasks) {
            const col = cols.find((c) => c.id === task.stage_id);
            if (col) {
                col.tasks.push(task);
            } else if (cols.length > 0) {
                cols[0].tasks.push(task);
            }
        }

        for (const col of cols) {
            const key = col.id ?? "none";
            const visibleCount = this.state.visibleCounts[key] || CARDS_PER_PAGE;
            col.visibleTasks = col.tasks.slice(0, visibleCount);
            col.hiddenCount = col.tasks.length - col.visibleTasks.length;
        }
        return cols;
    }

    showMoreCards(stageId) {
        const key = stageId ?? "none";
        this.state.visibleCounts[key] = (this.state.visibleCounts[key] || CARDS_PER_PAGE) + CARDS_PER_PAGE;
    }

    // ─── Drag & Drop ──────────────────────────────────────────────

    onDragStart(ev, taskId) {
        this.state.dragTaskId = taskId;
        ev.dataTransfer.effectAllowed = "move";
        ev.currentTarget.classList.add("dragging");
    }

    onDragEnd(ev) {
        ev.currentTarget.classList.remove("dragging");
        this.state.dragOverStageId = null;
    }

    onDragOver(ev, stageId) {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move";
        this.state.dragOverStageId = stageId;
    }

    onDragLeave() {
        this.state.dragOverStageId = null;
    }

    async onDrop(ev, stageId) {
        ev.preventDefault();
        const taskId = this.state.dragTaskId;
        if (!taskId) return;
        this.state.dragTaskId = null;
        this.state.dragOverStageId = null;
        if (stageId !== undefined) {
            await this.props.onWriteTask(taskId, { stage_id: stageId });
        }
    }

    openTask(taskId) {
        this.props.onOpenTask(taskId);
    }

    async quickAdd(stageId) {
        const name = (this.state.newTaskNames[stageId] || "").trim();
        if (!name) return;
        this.state.newTaskNames[stageId] = "";
        await this.props.onCreateTask(name, stageId);
    }

    onQuickAddKeydown(ev, stageId) {
        if (ev.key === "Enter") this.quickAdd(stageId);
    }

    getPriorityClass(priority) {
        return { "0": "priority-dot-low", "1": "priority-dot-medium", "2": "priority-dot-high", "3": "priority-dot-urgent" }[priority] || "priority-dot-low";
    }

    getPriorityLabel(priority) {
        return { "0": "-", "1": "Normal", "2": "High", "3": "Urgent" }[priority] || "-";
    }
}
