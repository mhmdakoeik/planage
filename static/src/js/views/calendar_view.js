/** @odoo-module **/

import { Component, useState } from "@odoo/owl";

/**
 * CalendarView — Monthly/weekly/daily planner.
 * Maps tasks by their due dates. Supports view mode switching.
 */
export class CalendarView extends Component {
    static template = "planage.CalendarView";

    setup() {
        this.state = useState({
            mode: "month",          // "month" | "week" | "day"
            currentDate: new Date(),
        });
    }

    get currentYear() {
        return this.state.currentDate.getFullYear();
    }

    get currentMonth() {
        return this.state.currentDate.getMonth();
    }

    get monthName() {
        return this.state.currentDate.toLocaleString("default", { month: "long", year: "numeric" });
    }

    get calendarDays() {
        const year = this.currentYear;
        const month = this.currentMonth;
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const days = [];
        // Padding blanks for the first week
        for (let i = 0; i < firstDay; i++) {
            days.push(null);
        }
        for (let d = 1; d <= daysInMonth; d++) {
            days.push(new Date(year, month, d));
        }
        return days;
    }

    getTasksForDate(date) {
        if (!date) return [];
        const tasks = this.props.tasks || [];
        return tasks.filter((t) => {
            if (!t.date_end) return false;
            const dl = new Date(t.date_end);
            return (
                dl.getFullYear() === date.getFullYear() &&
                dl.getMonth() === date.getMonth() &&
                dl.getDate() === date.getDate()
            );
        });
    }

    isToday(date) {
        if (!date) return false;
        const today = new Date();
        return (
            date.getFullYear() === today.getFullYear() &&
            date.getMonth() === today.getMonth() &&
            date.getDate() === today.getDate()
        );
    }

    prevMonth() {
        const d = new Date(this.state.currentDate);
        d.setMonth(d.getMonth() - 1);
        this.state.currentDate = d;
    }

    nextMonth() {
        const d = new Date(this.state.currentDate);
        d.setMonth(d.getMonth() + 1);
        this.state.currentDate = d;
    }

    goToday() {
        this.state.currentDate = new Date();
    }

    openTask(taskId) {
        this.props.onOpenTask(taskId);
    }
}
