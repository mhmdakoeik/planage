/** @odoo-module **/

import { Component, useState, onMounted, onWillUnmount } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { ConfirmationDialog, AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { showToast } from "../utils/toast";
import { applyTheme } from "../utils/theme";

export class ConfigView extends Component {
    static template = "planage.ConfigView";

    setup() {
        this.rpc = this.props.state.rpc;
        this.dialog = useService("dialog");
        this.state = useState({
            // Stage Creation State
            selectedSpaceId: null,
            selectedProjectId: null,
            newStageName: "",
            newStageColor: "#3b82f6",

            // Stage Editing State
            stages: [],
            editingStageId: null,
            editingStageName: "",
            editingStageColor: "#3b82f6",
            loadingStages: false,

            // Access Dropdown State
            openAccessDropdownId: null,
            openProjectAccessDropdownId: null,

            // Billing Settings State
            partners: [],
            loadingPartners: false,
            billingIsBillable: false,
            billingHourlyRate: 0,
            billingPartnerId: "",
        });

        const handleOutsideClick = (ev) => {
            if (this.state.openAccessDropdownId) {
                const isInside = ev.target.closest('.access-toggle-action');
                if (!isInside) {
                    this.state.openAccessDropdownId = null;
                    this.state.openProjectAccessDropdownId = null;
                }
            }
        };

        onMounted(() => {
            // Auto select first space and project
            const spaces = this.props.state.spaces || [];
            if (spaces.length > 0) {
                this.selectSpace(spaces[0].id);
            }
            if (this.props.state.isManager) {
                this.loadPartners();
            }
            document.addEventListener('click', handleOutsideClick);
        });

        onWillUnmount(() => {
            document.removeEventListener('click', handleOutsideClick);
        });
    }

    get spaces() {
        return this.props.state.spaces || [];
    }

    get users() {
        return this.props.state.users || [];
    }

    get partners() {
        return this.state.partners || [];
    }

    isUserAssignedToSpace(userId, spaceId) {
        const space = this.spaces.find(s => s.id === spaceId);
        if (!space || !space.user_ids) return false;
        return space.user_ids.includes(userId);
    }

    async toggleSpaceUser(userId, spaceId) {
        const space = this.spaces.find(s => s.id === spaceId);
        if (!space) return;
        let currentIds = space.user_ids ? [...space.user_ids] : [];
        if (currentIds.includes(userId)) {
            currentIds = currentIds.filter(id => id !== userId);
        } else {
            currentIds.push(userId);
        }
        await this.props.state.writeSpace(spaceId, { user_ids: currentIds });
    }

    toggleDropdown(userId) {
        if (this.state.openAccessDropdownId === userId) {
            this.state.openAccessDropdownId = null;
        } else {
            this.state.openAccessDropdownId = userId;
        }
    }

    async setAccess(userId, allow) {
        this.state.openAccessDropdownId = null;
        const spaceId = this.state.selectedSpaceId;
        const space = this.spaces.find(s => s.id === spaceId);
        if (!space) return;
        let currentIds = space.user_ids ? [...space.user_ids] : [];
        const isAssigned = currentIds.includes(userId);
        if (allow && !isAssigned) {
            currentIds.push(userId);
        } else if (!allow && isAssigned) {
            currentIds = currentIds.filter(id => id !== userId);
        } else {
            return;
        }
        await this.props.state.writeSpace(spaceId, { user_ids: currentIds });
    }

    // ─── Projects (previously "lists") ──────────────────────────
    get projects() {
        const space = this.spaces.find(s => s.id === this.state.selectedSpaceId);
        if (!space) return [];
        return space.projects || [];
    }

    isUserAssignedToProject(userId, projectId) {
        for (const space of this.spaces) {
            const proj = (space.projects || []).find(p => p.id === projectId);
            if (proj) return (proj.user_ids || []).includes(userId);
        }
        return false;
    }

    async toggleProjectUser(userId, projectId) {
        let proj = null;
        for (const space of this.spaces) {
            proj = (space.projects || []).find(p => p.id === projectId);
            if (proj) break;
        }
        if (!proj) return;
        let currentIds = proj.user_ids ? [...proj.user_ids] : [];
        if (currentIds.includes(userId)) {
            currentIds = currentIds.filter(id => id !== userId);
        } else {
            currentIds.push(userId);
        }
        await this.props.state.writeProject(projectId, { user_ids: currentIds });
    }

    toggleProjectDropdown(userId) {
        if (this.state.openProjectAccessDropdownId === userId) {
            this.state.openProjectAccessDropdownId = null;
        } else {
            this.state.openProjectAccessDropdownId = userId;
        }
    }

    async setProjectAccess(userId, allow) {
        this.state.openProjectAccessDropdownId = null;
        const projectId = this.state.selectedProjectId;
        let proj = null;
        for (const space of this.spaces) {
            proj = (space.projects || []).find(p => p.id === projectId);
            if (proj) break;
        }
        if (!proj) return;
        let currentIds = proj.user_ids ? [...proj.user_ids] : [];
        const isAssigned = currentIds.includes(userId);
        if (allow && !isAssigned) {
            currentIds.push(userId);
        } else if (!allow && isAssigned) {
            currentIds = currentIds.filter(id => id !== userId);
        } else {
            return;
        }
        await this.props.state.writeProject(projectId, { user_ids: currentIds });
    }

    selectSpace(spaceId) {
        const id = parseInt(spaceId);
        this.state.selectedSpaceId = id;
        this.state.selectedProjectId = null;
        this.state.stages = [];
        const allProjects = this.projects;
        if (allProjects && allProjects.length > 0) {
            this.selectProject(allProjects[0].id);
        }
    }

    async selectProject(projectId) {
        const id = parseInt(projectId);
        this.state.selectedProjectId = id;
        this.syncBillingFieldsFromProject(id);
        await this.loadStagesForProject(id);
    }

    // ─── Project Billing Settings ──────────────────────────────

    syncBillingFieldsFromProject(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        this.state.billingIsBillable = project ? !!project.is_billable : false;
        this.state.billingHourlyRate = project ? (project.hourly_rate || 0) : 0;
        this.state.billingPartnerId = project && project.partner_id ? String(project.partner_id) : "";
    }

    async loadPartners() {
        this.state.loadingPartners = true;
        try {
            this.state.partners = await this.rpc("/planage/partners", {});
        } catch (e) {
            console.error("Failed to load clients", e);
        } finally {
            this.state.loadingPartners = false;
        }
    }

    async saveBilling() {
        const projectId = this.state.selectedProjectId;
        if (!projectId) return;
        await this.props.state.writeProject(projectId, {
            is_billable: this.state.billingIsBillable,
            hourly_rate: parseFloat(this.state.billingHourlyRate) || 0,
            partner_id: this.state.billingPartnerId ? parseInt(this.state.billingPartnerId) : false,
        });
        this.syncBillingFieldsFromProject(projectId);
    }

    async loadStagesForProject(projectId) {
        if (!projectId) return;
        this.state.loadingStages = true;
        try {
            const stages = await this.rpc("/planage/stages", { project_id: projectId });
            this.state.stages = stages.filter(s => s.id);
        } catch (e) {
            console.error("Failed to load stages for configuration", e);
            showToast(this.props.state, _t("Failed to load stages."), "error");
        } finally {
            this.state.loadingStages = false;
        }
    }

    setTheme(mode) {
        applyTheme(this.props.state, mode === "dark");
    }

    async addStage() {
        const name = this.state.newStageName.trim();
        const projectId = this.state.selectedProjectId;
        const color = this.state.newStageColor;
        if (!name || !projectId) return;
        try {
            await this.rpc("/planage/stage/create", {
                project_id: projectId,
                name: name,
                color: color,
            });
            this.state.newStageName = "";
            this.state.newStageColor = "#3b82f6";
            await this.loadStagesForProject(projectId);
            // Refresh global app stages if active project matches
            if (this.props.state.activeProjectId === projectId) {
                const refreshed = await this.rpc("/planage/stages", { project_id: projectId });
                this.props.state.stages = refreshed;
            }
        } catch (e) {
            console.error("Failed to add stage", e);
            showToast(this.props.state, _t("Failed to add stage."), "error");
        }
    }

    startEditStage(stage) {
        this.state.editingStageId = stage.id;
        this.state.editingStageName = stage.name;
        this.state.editingStageColor = stage.color || "#3b82f6";
    }

    cancelEditStage() {
        this.state.editingStageId = null;
        this.state.editingStageName = "";
    }

    async saveStage() {
        const stageId = this.state.editingStageId;
        const name = this.state.editingStageName.trim();
        const color = this.state.editingStageColor;
        const projectId = this.state.selectedProjectId;
        if (!stageId || !name) return;
        try {
            await this.rpc("/planage/stage/write", {
                stage_id: stageId,
                vals: { name, color }
            });
            this.state.editingStageId = null;
            await this.loadStagesForProject(projectId);
            if (this.props.state.activeProjectId === projectId) {
                const refreshed = await this.rpc("/planage/stages", { project_id: projectId });
                this.props.state.stages = refreshed;
            }
        } catch (e) {
            console.error("Failed to save stage", e);
            showToast(this.props.state, _t("Failed to save stage."), "error");
        }
    }

    async deleteStage(stageId) {
        const projectId = this.state.selectedProjectId;
        try {
            await this.rpc("/planage/stage/delete", { stage_id: stageId });
            if (this.state.editingStageId === stageId) {
                this.state.editingStageId = null;
            }
            await this.loadStagesForProject(projectId);
            if (this.props.state.activeProjectId === projectId) {
                const refreshed = await this.rpc("/planage/stages", { project_id: projectId });
                this.props.state.stages = refreshed;
            }
        } catch (e) {
            console.error("Failed to delete stage", e);
            showToast(this.props.state, _t("Failed to delete stage."), "error");
        }
    }

    async moveStage(stage, direction) {
        const index = this.state.stages.findIndex(s => s.id === stage.id);
        if (index === -1) return;
        let targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= this.state.stages.length) return;
        const projectId = this.state.selectedProjectId;
        try {
            for (let i = 0; i < this.state.stages.length; i++) {
                let seq = (i + 1) * 10;
                let sId = this.state.stages[i].id;
                if (i === index) {
                    seq = (targetIndex + 1) * 10;
                } else if (i === targetIndex) {
                    seq = (index + 1) * 10;
                }
                await this.rpc("/planage/stage/write", {
                    stage_id: sId,
                    vals: { sequence: seq }
                });
            }
            await this.loadStagesForProject(projectId);
            if (this.props.state.activeProjectId === projectId) {
                const refreshed = await this.rpc("/planage/stages", { project_id: projectId });
                this.props.state.stages = refreshed;
            }
        } catch (e) {
            console.error("Failed to move stage", e);
            showToast(this.props.state, _t("Failed to reorder stages."), "error");
        }
    }

    confirmResetSystem() {
        this.dialog.add(ConfirmationDialog, {
            title: _t("Reset System"),
            body: _t("WARNING: Are you absolutely sure you want to reset the system? This will permanently delete all Spaces, Folders, Projects, Sprints, Tasks, Chat Messages, and Documents. This action is IRREVERSIBLE."),
            confirmLabel: _t("Reset Everything"),
            confirmClass: "btn-danger",
            confirm: async () => {
                try {
                    const result = await this.rpc("/planage/reset", {});
                    if (result && result.error) {
                        this.dialog.add(AlertDialog, { body: result.error });
                        return;
                    }
                    window.location.reload();
                } catch (e) {
                    console.error("Failed to reset system", e);
                    this.dialog.add(AlertDialog, { body: _t("An error occurred while resetting the system.") });
                }
            },
            cancel: () => {},
        });
    }
}
