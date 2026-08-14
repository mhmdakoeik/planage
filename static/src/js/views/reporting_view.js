/** @odoo-module **/

import { Component, onMounted, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { showToast } from "../utils/toast";

export class ReportingView extends Component {
    static template = "planage.ReportingView";

    setup() {
        this.state = useState({
            loading: true,
            reports: {
                project_workload: [],
                assignee_workload: [],
                stage_pipeline: [],
                late_tasks: []
            },
            filters: {
                projects: [],
            },
            selectedProjectId: false,
            selectedSprintId: false,
            selectedWeek: "",
            selectedMonth: "",
            pagination: {
                late_tasks: { page: 1, pageSize: 5 },
                assignee_workload: { page: 1, pageSize: 5 },
                project_workload: { page: 1, pageSize: 5 }
            }
        });

        onMounted(async () => {
            await this.loadFilters();
            await this.loadReports();
        });
    }

    async loadFilters() {
        try {
            const filters = await this.props.state.rpc("/planage/dashboard/filters", {});
            this.state.filters = filters;
        } catch (e) {
            console.warn("Could not load reporting filters", e);
            showToast(this.props.state, _t("Failed to load report filters."), "error");
        }
    }

    get availableSprints() {
        if (!this.state.selectedProjectId || !this.state.filters.projects) {
            return [];
        }
        const project = this.state.filters.projects.find(p => p.id == this.state.selectedProjectId);
        return project ? project.sprints : [];
    }

    async onProjectChange(ev) {
        this.state.selectedProjectId = ev.target.value;
        this.state.selectedSprintId = false; // Reset sprint when project changes
        await this.loadReports();
    }

    async onSprintChange(ev) {
        this.state.selectedSprintId = ev.target.value;
        await this.loadReports();
    }

    async onWeekChange(ev) {
        this.state.selectedWeek = ev.target.value;
        this.state.selectedMonth = ""; // Mutually exclusive
        await this.loadReports();
    }

    async onMonthChange(ev) {
        this.state.selectedMonth = ev.target.value;
        this.state.selectedWeek = ""; // Mutually exclusive
        await this.loadReports();
    }

    async loadReports() {
        this.state.loading = true;
        try {
            const kwargs = {};
            if (this.state.selectedProjectId) {
                kwargs.project_id = this.state.selectedProjectId;
            }
            if (this.state.selectedSprintId) {
                kwargs.sprint_id = this.state.selectedSprintId;
            }
            if (this.state.selectedWeek) {
                kwargs.week = this.state.selectedWeek;
            }
            if (this.state.selectedMonth) {
                kwargs.month = this.state.selectedMonth;
            }
            const data = await this.props.state.rpc("/planage/reports/data", kwargs);
            this.state.reports = data;
            
            // Reset pagination pages to 1 on fresh load
            this.state.pagination.late_tasks.page = 1;
            this.state.pagination.assignee_workload.page = 1;
            this.state.pagination.project_workload.page = 1;
            
        } catch (e) {
            console.error("Failed to load reports", e);
            showToast(this.props.state, _t("Failed to load reports."), "error");
        } finally {
            this.state.loading = false;
        }
    }

    // --- Pagination Methods ---
    
    getPaginatedData(tableName) {
        const p = this.state.pagination[tableName];
        const start = (p.page - 1) * p.pageSize;
        return this.state.reports[tableName].slice(start, start + p.pageSize);
    }
    
    getPaginationInfo(tableName) {
        const p = this.state.pagination[tableName];
        const total = this.state.reports[tableName] ? this.state.reports[tableName].length : 0;
        const totalPages = Math.ceil(total / p.pageSize) || 1;
        return {
            page: p.page,
            totalPages: totalPages,
            hasPrev: p.page > 1,
            hasNext: p.page < totalPages
        };
    }
    
    nextPage(tableName) {
        const info = this.getPaginationInfo(tableName);
        if (info.hasNext) {
            this.state.pagination[tableName].page++;
        }
    }
    
    prevPage(tableName) {
        const info = this.getPaginationInfo(tableName);
        if (info.hasPrev) {
            this.state.pagination[tableName].page--;
        }
    }

    _buildExportUrl(basePath) {
        let url = basePath + "?";
        if (this.state.selectedProjectId) {
            url += `project_id=${this.state.selectedProjectId}&`;
        }
        if (this.state.selectedSprintId) {
            url += `sprint_id=${this.state.selectedSprintId}&`;
        }
        if (this.state.selectedWeek) {
            url += `week=${this.state.selectedWeek}&`;
        }
        if (this.state.selectedMonth) {
            url += `month=${this.state.selectedMonth}&`;
        }
        return url;
    }

    async exportPdf() {
        window.open(this._buildExportUrl("/planage/reports/export/pdf"), "_blank");
    }

    async exportExcel() {
        window.open(this._buildExportUrl("/planage/reports/export/excel"), "_blank");
    }
}
