/** @odoo-module **/

import { Component, useState } from "@odoo/owl";

/**
 * ListView — High-density spreadsheet grid.
 * Groups tasks by Stage or Priority.
 * Supports inline quick-add at the bottom of each group.
 */
export class ListView extends Component {
    static template = "planage.ListView";

    setup() {
        this.state = useState({
            groupBy: "stage",
            newTaskNames: {},
            expandedGroups: {},
            expandedSubtasks: {},  // taskId -> bool
            groupPages: {},        // groupId -> page number
        });
    }

    get groupedTasks() {
        const allTasks = this.props.tasks || [];
        // Only show top-level tasks (not subtasks) in the main rows
        const tasks = allTasks.filter((t) => !t.parent_id);
        const groupBy = this.state.groupBy;

        if (groupBy === "stage") {
            const stages = this.props.stages || [];
            const grouped = stages.map((s) => ({ ...s, tasks: [] }));

            for (const task of tasks) {
                const group = grouped.find((g) => g.id === task.stage_id);
                if (group) {
                    group.tasks.push(task);
                } else if (grouped.length > 0) {
                    grouped[0].tasks.push(task);
                }
            }
            return grouped;
        }

        // Group by priority
        const priorityGroups = [
            { id: "3", name: "🔴 Urgent", color: "#ef4444", tasks: [] },
            { id: "2", name: "🟠 High", color: "#f97316", tasks: [] },
            { id: "1", name: "🟡 Medium", color: "#eab308", tasks: [] },
            { id: "0", name: "🟢 Low", color: "#22c55e", tasks: [] },
        ];
        for (const task of tasks) {
            const group = priorityGroups.find((g) => g.id === task.priority);
            if (group) group.tasks.push(task);
        }
        return priorityGroups;
    }

    getGroupTotalPages(group) {
        const tasksCount = (group.tasks || []).length;
        const pageSize = 5;
        return Math.ceil(tasksCount / pageSize) || 1;
    }

    getGroupPagedTasks(group) {
        const page = this.state.groupPages[group.id || "none"] || 1;
        const pageSize = 5;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        return (group.tasks || []).slice(start, end);
    }

    changePage(groupId, direction) {
        const currentPage = this.state.groupPages[groupId] || 1;
        const nextPage = currentPage + direction;
        const group = this.groupedTasks.find((g) => (g.id || "none") === String(groupId) || (g.id || "none") === groupId);
        if (!group) return;
        const totalPages = this.getGroupTotalPages(group);
        if (nextPage >= 1 && nextPage <= totalPages) {
            this.state.groupPages[groupId] = nextPage;
        }
    }

    getTaskAbsoluteIndex(group, taskIndex) {
        const page = this.state.groupPages[group.id || "none"] || 1;
        const pageSize = 5;
        return (page - 1) * pageSize + taskIndex + 1;
    }

    isGroupExpanded(groupId) {
        return this.state.expandedGroups[groupId] !== false;
    }

    toggleGroup(groupId) {
        this.state.expandedGroups[groupId] = !this.isGroupExpanded(groupId);
    }

    openTask(taskId) {
        this.props.onOpenTask(taskId);
    }

    getSubtasks(taskId) {
        return (this.props.tasks || []).filter((t) => t.parent_id === taskId);
    }

    toggleSubtasks(ev, taskId) {
        ev.stopPropagation();
        this.state.expandedSubtasks[taskId] = !this.state.expandedSubtasks[taskId];
    }

    isSubtasksExpanded(taskId) {
        return !!this.state.expandedSubtasks[taskId];
    }

    async quickAddTask(groupKey, stageId = null) {
        const name = (this.state.newTaskNames[groupKey] || "").trim();
        if (!name) return;
        this.state.newTaskNames[groupKey] = "";
        await this.props.onCreateTask(name, stageId);

        // Auto-navigate to the last page of this group to instantly show the added task
        setTimeout(() => {
            const group = this.groupedTasks.find((g) => (g.id || "none") === String(groupKey) || (g.id || "none") === groupKey);
            if (group) {
                const totalPages = this.getGroupTotalPages(group);
                this.state.groupPages[groupKey] = totalPages;
            }
        }, 150);
    }

    onQuickAddKeydown(ev, groupKey, stageId) {
        if (ev.key === "Enter") this.quickAddTask(groupKey, stageId);
    }

    getPriorityLabel(priority) {
        return { "0": "Low", "1": "Medium", "2": "High", "3": "Urgent" }[priority] || "Low";
    }

    getPriorityClass(priority) {
        return { "0": "badge-low", "1": "badge-medium", "2": "badge-high", "3": "badge-urgent" }[priority] || "badge-low";
    }

    setGroupBy(val) {
        this.state.groupBy = val;
        this.state.groupPages = {};
    }

    formatDate(dateStr) {
        if (!dateStr) return "—";
        try {
            const cleanStr = dateStr.includes("Z") ? dateStr : dateStr.replace(" ", "T") + "Z";
            const d = new Date(cleanStr);
            if (isNaN(d.getTime())) return dateStr.substring(0, 10);
            return d.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
        } catch (e) {
            return dateStr.substring(0, 10);
        }
    }

    getNote(task) {
        if (task.description) {
            const tmp = document.createElement("div");
            tmp.innerHTML = task.description;
            const text = tmp.textContent || tmp.innerText || "";
            if (text.trim()) {
                return text.length > 25 ? text.substring(0, 22) + "..." : text;
            }
        }
        return { "0": "Routine Tasks", "1": "Requires Review", "2": "High Priority", "3": "Crucial Milestone" }[task.priority] || "—";
    }
}
