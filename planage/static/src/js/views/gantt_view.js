/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { findSprintById } from "../utils/sprint";

// Rendering hundreds of bars on one timeline is what makes large
// projects/sprints feel sluggish; cap what's rendered and let the user
// reveal more on demand instead.
const BARS_PER_PAGE = 50;

/**
 * GanttView — Timeline chart showing tasks from start → deadline.
 * Renders a horizontal bar chart with relative positioning.
 * Supports dependency visualization.
 */
export class GanttView extends Component {
    static template = "planage.GanttView";

    setup() {
        this.state = useState({
            timelineStart: this._getMonthStart(),
            timelineDays: 45,       // Show 45-day window for clear day details
            visibleCount: BARS_PER_PAGE,
        });
    }

    showMoreTasks() {
        this.state.visibleCount += BARS_PER_PAGE;
    }

    _getMonthStart() {
        const d = new Date();
        // Go 7 days back from today to center it beautifully
        d.setDate(d.getDate() - 7);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    get timelineEnd() {
        const end = new Date(this.state.timelineStart);
        end.setDate(end.getDate() + this.state.timelineDays);
        return end;
    }

    get weekHeaders() {
        const weeks = [];
        const start = new Date(this.state.timelineStart);
        const days = this.state.timelineDays;
        
        // Loop through 45 days in increments of 7
        for (let i = 0; i < days; i += 7) {
            const wStart = new Date(start);
            wStart.setDate(start.getDate() + i);
            const wEnd = new Date(wStart);
            wEnd.setDate(wStart.getDate() + 6);
            
            const label = `${wStart.getDate()} ${wStart.toLocaleString('default', { month: 'short' })} - ${wEnd.getDate()} ${wEnd.toLocaleString('default', { month: 'short' })}`;
            weeks.push({
                label: label.toUpperCase(),
                left: (i / days) * 100,
                width: (7 / days) * 100,
            });
        }
        return weeks;
    }
    
    get dayHeaders() {
        const days = [];
        const start = new Date(this.state.timelineStart);
        const totalDays = this.state.timelineDays;
        
        for (let i = 0; i < totalDays; i++) {
            const date = new Date(start);
            date.setDate(start.getDate() + i);
            days.push({
                number: date.getDate(),
                left: (i / totalDays) * 100,
                width: (1 / totalDays) * 100,
                isToday: this._isSameDay(date, new Date()),
                dayOfWeek: date.getDay(),
            });
        }
        return days;
    }

    _isSameDay(d1, d2) {
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate();
    }

    get todayMarkerLeft() {
        const start = this.state.timelineStart.getTime();
        const today = new Date().getTime();
        const total = this.state.timelineDays * 24 * 60 * 60 * 1000;
        
        if (today >= start && today <= start + total) {
            return ((today - start) / total) * 100;
        }
        return null;
    }

    get allTasksWithBars() {
        const tasks = this.props.tasks || [];
        const start = this.state.timelineStart.getTime();
        const total = this.state.timelineDays * 24 * 60 * 60 * 1000;

        return tasks
            .filter((t) => t.date_start || t.date_end)
            .map((t) => {
                const taskStart = t.date_start ? new Date(t.date_start).getTime() : start;
                const taskEnd = t.date_end ? new Date(t.date_end).getTime() : taskStart + 86400000;

                // Calculate positioning percentage
                const left = Math.max(0, ((taskStart - start) / total) * 100);
                const width = Math.min(100 - left, ((taskEnd - taskStart) / total) * 100);
                return { ...t, barLeft: left, barWidth: Math.max(width, 1) };
            });
    }

    get tasksWithBars() {
        return this.allTasksWithBars.slice(0, this.state.visibleCount);
    }

    get hiddenTaskCount() {
        return Math.max(0, this.allTasksWithBars.length - this.state.visibleCount);
    }

    get activeSprint() {
        return findSprintById(this.props.state.spaces, this.props.state.activeSprintId);
    }

    get sprintBar() {
        const sprint = this.activeSprint;
        if (!sprint || !sprint.date_from || !sprint.date_to) return null;
        
        const start = this.state.timelineStart.getTime();
        const total = this.state.timelineDays * 24 * 60 * 60 * 1000;
        
        const sprintStart = new Date(sprint.date_from).getTime();
        const sprintEnd = new Date(sprint.date_to).getTime();
        
        const left = Math.max(0, ((sprintStart - start) / total) * 100);
        const width = Math.min(100 - left, ((sprintEnd - sprintStart) / total) * 100);
        
        return {
            ...sprint,
            barLeft: left,
            barWidth: Math.max(width, 1),
        };
    }

    prevPeriod() {
        const d = new Date(this.state.timelineStart);
        d.setDate(d.getDate() - 14);
        this.state.timelineStart = d;
    }

    nextPeriod() {
        const d = new Date(this.state.timelineStart);
        d.setDate(d.getDate() + 14);
        this.state.timelineStart = d;
    }

    goToday() {
        this.state.timelineStart = this._getMonthStart();
    }

    openTask(taskId) {
        this.props.onOpenTask(taskId);
    }

    getPriorityColor(priority) {
        return { "0": "#22c55e", "1": "#eab308", "2": "#f97316", "3": "#ef4444" }[priority] || "#6366f1";
    }
}
