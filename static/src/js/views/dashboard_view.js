/** @odoo-module **/

import { Component, onMounted, onPatched, onWillUnmount, useState, useRef } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { showToast } from "../utils/toast";

export class DashboardView extends Component {
    static template = "planage.DashboardView";

    setup() {
        this.donutRef = useRef("donutCanvas");
        this.sparklineRef = useRef("sparklineCanvas");

        this.state = useState({
            stats: {
                total_tasks: 0,
                total_docs: 0,
                stage_stats: [],
                priorities: {
                    urgent: 0,
                    high: 0,
                    normal: 0,
                    low: 0,
                },
                list_stats: [],
                tasks_by_day: [],
            },
            filters: {
                projects: [],
            },
            selectedProjectId: false,
            selectedSprintId: false,
            loading: true,
            currentTime: this._getFormattedTime(),
        });

        onMounted(async () => {
            await this.loadFilters();
            await this.loadStats();
            this._clockInterval = setInterval(() => {
                this.state.currentTime = this._getFormattedTime();
            }, 60000);
        });

        onPatched(() => {
            if (!this.state.loading) {
                this._drawDonutChart();
                this._drawSparkline();
            }
        });

        onWillUnmount(() => {
            if (this._clockInterval) {
                clearInterval(this._clockInterval);
            }
        });
    }

    _getFormattedTime() {
        const now = new Date();
        return now.toLocaleString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    async loadFilters() {
        try {
            const filters = await this.props.state.rpc("/planage/dashboard/filters", {});
            this.state.filters = filters;
        } catch (e) {
            console.warn("Could not load dashboard filters", e);
            showToast(this.props.state, _t("Failed to load dashboard filters."), "error");
        }
    }

    async loadStats() {
        try {
            this.state.loading = true;
            const kwargs = {};
            if (this.state.selectedProjectId) {
                kwargs.project_id = this.state.selectedProjectId;
            }
            if (this.state.selectedSprintId) {
                kwargs.sprint_id = this.state.selectedSprintId;
            }
            const stats = await this.props.state.rpc("/planage/dashboard/stats", kwargs);
            this.state.stats = stats;
        } catch (e) {
            console.warn("Could not load dashboard statistics", e);
            showToast(this.props.state, _t("Failed to load dashboard statistics."), "error");
        } finally {
            this.state.loading = false;
        }
    }

    async onProjectChange(ev) {
        this.state.selectedProjectId = ev.target.value;
        this.state.selectedSprintId = false; // Reset sprint when project changes
        await this.loadStats();
    }

    async onSprintChange(ev) {
        this.state.selectedSprintId = ev.target.value;
        await this.loadStats();
    }

    get availableSprints() {
        if (!this.state.selectedProjectId) return [];
        const project = this.state.filters.projects.find(p => String(p.id) === String(this.state.selectedProjectId));
        return project ? project.sprints : [];
    }

    // ─── Helpers ──────────────────────────────────────────────────

    get hasTaskData() {
        return this.state.stats.total_tasks > 0;
    }

    get hasSparklineData() {
        return (this.state.stats.tasks_by_day || []).some(d => d.count > 0);
    }

    get hasPriorityData() {
        const p = this.state.stats.priorities || {};
        return (p.urgent + p.high + p.normal + p.low) > 0;
    }

    // ─── Donut Chart ──────────────────────────────────────────────

    _drawDonutChart() {
        const canvas = this.donutRef.el;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        const W = canvas.width;
        const H = canvas.height;
        const cx = W / 2;
        const cy = H / 2;
        const outerR = cx - 10;
        const innerR = outerR * 0.58;
        const strokeW = 2;

        ctx.clearRect(0, 0, W, H);

        const stageStats = this.state.stats.stage_stats || [];
        const total = stageStats.reduce((sum, s) => sum + s.count, 0);

        if (!total) {
            // ── Empty state: draw a grey ring ──
            ctx.beginPath();
            ctx.arc(cx, cy, outerR, 0, 2 * Math.PI);
            ctx.fillStyle = "rgba(148,163,184,0.13)";
            ctx.fill();

            ctx.beginPath();
            ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
            ctx.fillStyle = "rgba(248,250,252,1)"; // match card background (white/near-white)
            ctx.fill();

            // grey dashed border on ring
            ctx.beginPath();
            ctx.arc(cx, cy, (outerR + innerR) / 2, 0, 2 * Math.PI);
            ctx.strokeStyle = "rgba(148,163,184,0.25)";
            ctx.lineWidth = outerR - innerR;
            ctx.setLineDash([8, 6]);
            ctx.stroke();
            ctx.setLineDash([]);

            // center text
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "rgba(148,163,184,0.6)";
            ctx.font = `bold ${Math.round(cx * 0.28)}px Inter, sans-serif`;
            ctx.fillText("0", cx, cy - 9);
            ctx.font = `${Math.round(cx * 0.14)}px Inter, sans-serif`;
            ctx.fillText("no tasks", cx, cy + Math.round(cx * 0.2));
            return;
        }

        // ── Colored donut ──
        const segments = (this.state.stats.stage_stats || []).filter(s => s.count > 0);

        let startAngle = -Math.PI / 2;
        const gapAngle = segments.length > 1 ? 0.04 : 0; // small gap between segments

        segments.forEach(seg => {
            const sweep = (seg.count / total) * 2 * Math.PI - gapAngle;
            const endAngle = startAngle + sweep;

            ctx.beginPath();
            ctx.arc(cx, cy, outerR, startAngle, endAngle);
            ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
            ctx.closePath();

            const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
            grad.addColorStop(0, seg.color + "bb");
            grad.addColorStop(1, seg.color);
            ctx.fillStyle = grad;
            ctx.shadowColor = seg.color + "44";
            ctx.shadowBlur = 6;
            ctx.fill();
            ctx.shadowBlur = 0;

            startAngle = endAngle + gapAngle;
        });

        // White separator ring stroke
        ctx.beginPath();
        ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
        ctx.fillStyle = "#ffffff";
        ctx.fill();

        // Center text
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#1e293b";
        ctx.font = `bold ${Math.round(cx * 0.34)}px Inter, sans-serif`;
        ctx.fillText(total, cx, cy - 9);
        ctx.font = `${Math.round(cx * 0.155)}px Inter, sans-serif`;
        ctx.fillStyle = "#94a3b8";
        ctx.fillText("total", cx, cy + Math.round(cx * 0.22));
    }

    // ─── Sparkline Chart ──────────────────────────────────────────

    _drawSparkline() {
        const canvas = this.sparklineRef.el;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        const days = this.state.stats.tasks_by_day || [];

        const W = canvas.width;
        const H = canvas.height;
        const padT = 18, padB = 34, padL = 12, padR = 12;
        const chartW = W - padL - padR;
        const chartH = H - padT - padB;
        const hasData = days.some(d => d.count > 0);

        ctx.clearRect(0, 0, W, H);

        // Always build point positions (use labels for x-axis regardless)
        const xStep = days.length > 1 ? chartW / (days.length - 1) : 0;
        const counts = days.map(d => d.count);
        const maxVal = Math.max(...counts, 1);

        // ── X-axis day labels (always shown) ──
        ctx.font = "11px Inter, sans-serif";
        ctx.fillStyle = "rgba(148,163,184,0.9)";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        days.forEach((d, i) => {
            const x = padL + i * xStep;
            ctx.fillText(d.label || "", x, H - padB + 8);
        });

        if (!hasData) {
            // ── Empty state: flat dashed grey baseline ──
            const baseY = padT + chartH;

            // Subtle grey zone fill
            ctx.beginPath();
            ctx.moveTo(padL, baseY);
            ctx.lineTo(padL + chartW, baseY);
            ctx.lineTo(padL + chartW, padT + chartH * 0.1);
            ctx.lineTo(padL, padT + chartH * 0.1);
            ctx.closePath();
            ctx.fillStyle = "rgba(241,245,249,0.6)";
            ctx.fill();

            // dashed line
            ctx.beginPath();
            ctx.moveTo(padL, baseY);
            ctx.lineTo(padL + chartW, baseY);
            ctx.strokeStyle = "rgba(148,163,184,0.35)";
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 5]);
            ctx.stroke();
            ctx.setLineDash([]);

            // dot at each day position on the baseline
            days.forEach((d, i) => {
                const x = padL + i * xStep;
                ctx.beginPath();
                ctx.arc(x, baseY, 3, 0, 2 * Math.PI);
                ctx.fillStyle = "rgba(148,163,184,0.3)";
                ctx.fill();
            });

            // "No activity" label
            ctx.font = "12px Inter, sans-serif";
            ctx.fillStyle = "rgba(148,163,184,0.6)";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("No activity in the last 7 days", W / 2, padT + chartH * 0.45);
            return;
        }

        // ── Colored sparkline ──
        const pts = days.map((d, i) => ({
            x: padL + i * xStep,
            y: padT + chartH - (d.count / maxVal) * chartH,
            count: d.count,
        }));

        // Gradient fill under line
        const grad = ctx.createLinearGradient(0, padT, 0, H - padB);
        grad.addColorStop(0, "rgba(99,102,241,0.3)");
        grad.addColorStop(1, "rgba(99,102,241,0.02)");
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        pts.forEach((p, i) => {
            if (i > 0) {
                const cpx = (pts[i - 1].x + p.x) / 2;
                ctx.bezierCurveTo(cpx, pts[i - 1].y, cpx, p.y, p.x, p.y);
            }
        });
        ctx.lineTo(pts[pts.length - 1].x, H - padB);
        ctx.lineTo(pts[0].x, H - padB);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Line stroke
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        pts.forEach((p, i) => {
            if (i > 0) {
                const cpx = (pts[i - 1].x + p.x) / 2;
                ctx.bezierCurveTo(cpx, pts[i - 1].y, cpx, p.y, p.x, p.y);
            }
        });
        ctx.strokeStyle = "#6366f1";
        ctx.lineWidth = 2.5;
        ctx.shadowColor = "rgba(99,102,241,0.35)";
        ctx.shadowBlur = 5;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Dots
        pts.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
            ctx.fillStyle = "#fff";
            ctx.fill();
            ctx.strokeStyle = "#6366f1";
            ctx.lineWidth = 2;
            ctx.stroke();
        });

        // Count labels above points
        ctx.font = "bold 11px Inter, sans-serif";
        ctx.fillStyle = "#6366f1";
        ctx.textBaseline = "bottom";
        ctx.textAlign = "center";
        pts.forEach(p => {
            if (p.count > 0) ctx.fillText(p.count, p.x, p.y - 5);
        });
    }

    // ─── Completion rate ──────────────────────────────────────────

    get completionRate() {
        const t = this.state.stats.total_tasks;
        if (!t) return 0;
        let completed = 0;
        for (let p of (this.state.stats.list_stats || [])) {
            completed += p.done_count;
        }
        return Math.round((completed / t) * 100);
    }
}
