/** @odoo-module **/

import { Component, useState, useEffect } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { showToast } from "../utils/toast";
import { applyTheme } from "../utils/theme";

/**
 * Sidebar — Left navigation panel.
 * Renders the hierarchical Workspace > Space > Folder > List navigation tree.
 * Supports collapsing, hover states, and inline list/space creation.
 */
export class Sidebar extends Component {
    static template = "planage.Sidebar";

    setup() {
        this.dialog = useService("dialog");
        this.state = useState({
            expandedSpaces: {},
            expandedFolders: {},
            expandedProjects: {},
            docsExpanded: true,
        });

        useEffect(() => {
            if (this.props.state.activeSpaceId) {
                this.state.expandedSpaces[this.props.state.activeSpaceId] = true;
            }
            if (this.props.state.activeProjectId) {
                // Auto-expand the project to show its folders/sprints
                this.state.expandedProjects[this.props.state.activeProjectId] = true;
                
                // Also expand the parent folder if the active sprint is inside one
                if (this.props.state.activeSprintId && this.props.state.spaces) {
                    const space = this.props.state.spaces.find(s => s.id === this.props.state.activeSpaceId);
                    if (space && space.projects) {
                        const project = space.projects.find(p => p.id === this.props.state.activeProjectId);
                        if (project && project.folders) {
                            for (const folder of project.folders) {
                                if (folder.sprints && folder.sprints.some(s => s.id === this.props.state.activeSprintId)) {
                                    this.state.expandedFolders[folder.id] = true;
                                }
                            }
                        }
                    }
                }
            }
        }, () => [this.props.state.activeSpaceId, this.props.state.activeProjectId, this.props.state.activeSprintId]);
    }

    get spaces() {
        return (this.props.state.spaces || []).slice(0, 3);
    }

    get documents() {
        return this.props.state.documents || [];
    }

    get visibleDocuments() {
        return this.documents.slice(0, 3);
    }

    collapseAll() {
        this.state.expandedSpaces = {};
        this.state.expandedProjects = {};
        this.state.expandedFolders = {};
    }

    openDocsPage() {
        this.collapseAll();
        this.props.onSetView("docs");
    }

    openConfigPage() {
        this.collapseAll();
        this.props.onSetView("config");
    }

    openReportingPage() {
        this.collapseAll();
        this.props.onSetView("reporting");
    }

    openDashboard() {
        this.collapseAll();
        this.props.onSetView("dashboard");
    }

    openMyTasks() {
        this.collapseAll();
        this.props.onSetView("my_tasks");
    }

    openNotifications() {
        this.collapseAll();
        this.props.onSetView("notifications");
    }

    toggleDocsExpanded() {
        this.state.docsExpanded = !this.state.docsExpanded;
    }

    get activeSpaceId() {
        return this.props.state.activeSpaceId;
    }

    get activeProjectId() {
        return this.props.state.activeProjectId;
    }

    get activeSprintId() {
        return this.props.state.activeSprintId;
    }

    get sidebarCollapsed() {
        return this.props.state.sidebarCollapsed;
    }

    toggleSpace(spaceId) {
        this.state.expandedSpaces[spaceId] = !this.state.expandedSpaces[spaceId];
        this.props.onSelectSpace(spaceId);
    }

    isSpaceExpanded(spaceId) {
        return this.state.expandedSpaces[spaceId] === true;
    }

    toggleFolder(folderId) {
        this.state.expandedFolders[folderId] = !this.state.expandedFolders[folderId];
    }

    isFolderExpanded(folderId) {
        return this.state.expandedFolders[folderId] === true; // Folders collapsed by default for rich layout
    }

    toggleProject(projectId) {
        this.state.expandedProjects[projectId] = !this.state.expandedProjects[projectId];
    }

    isProjectExpanded(projectId) {
        return this.state.expandedProjects[projectId] === true; // Sprints collapsed by default
    }

    selectProject(projectId) {
        this.props.state.selectProject(projectId);
    }

    selectSprint(projectId, sprintId) {
        this.props.state.selectProject(projectId, sprintId);
    }

    openNewSpaceModal() {
        this.props.state.openSpaceModal();
    }

    openNewFolderModal(spaceId) {
        this.props.state.openFolderModal();
        if (spaceId) {
            this.props.state.newFolderSpaceId = spaceId;
        }
    }

    openNewProjectModal(spaceId) {
        this.props.state.openProjectModal();
        if (spaceId) {
            this.props.state.newProjectSpaceId = spaceId;
        }
    }

    openNewSprintModal(projectId) {
        this.props.state.openSprintModal();
        if (projectId) {
            this.props.state.newSprintProjectId = projectId;
        }
    }

    toggleTheme() {
        applyTheme(this.props.state, !this.props.state.isDark);
    }

    onDragStart(ev, sprintId, projectId) {
        ev.dataTransfer.setData("text/plain", JSON.stringify({ sprintId, projectId }));
        ev.dataTransfer.effectAllowed = "move";
        this.activeDragProjectId = projectId;
        document.body.classList.add("planage-dragging-sprint");
    }

    onDragEnd(ev) {
        this.activeDragProjectId = null;
        document.body.classList.remove("planage-dragging-sprint");
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    }

    onDragOverFolder(ev, projectId) {
        if (this.activeDragProjectId && this.activeDragProjectId !== projectId) {
            return;
        }
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move";
    }

    onDragEnterFolder(ev, projectId) {
        if (this.activeDragProjectId && this.activeDragProjectId !== projectId) {
            return;
        }
        ev.currentTarget.classList.add("drag-over");
    }

    onDragLeaveFolder(ev, projectId) {
        ev.currentTarget.classList.remove("drag-over");
    }

    async onDropOnFolder(ev, folderId, destProjectId) {
        ev.preventDefault();
        ev.currentTarget.classList.remove("drag-over");
        this.activeDragProjectId = null;
        document.body.classList.remove("planage-dragging-sprint");
        try {
            const dataStr = ev.dataTransfer.getData("text/plain");
            if (!dataStr) return;
            const data = JSON.parse(dataStr);
            const { sprintId, projectId } = data;
            
            if (projectId !== destProjectId) {
                return;
            }
            
            await this.props.state.rpc("/planage/sprint/write", {
                sprint_id: sprintId,
                vals: { folder_id: folderId }
            });
            
            await this.props.onReloadSpaces();
            
            if (this.props.state.activeSprintId === sprintId) {
                await this.props.state.selectProject(destProjectId, sprintId);
            }
        } catch (e) {
            console.error("Failed to move sprint to folder", e);
            showToast(this.props.state, _t("Failed to move sprint. Please try again."), "error");
        }
    }

    onDragOverProject(ev, projectId) {
        if (this.activeDragProjectId && this.activeDragProjectId !== projectId) {
            return;
        }
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move";
    }

    onDragEnterProject(ev, projectId) {
        if (this.activeDragProjectId && this.activeDragProjectId !== projectId) {
            return;
        }
        ev.currentTarget.classList.add("drag-over");
    }

    onDragLeaveProject(ev, projectId) {
        ev.currentTarget.classList.remove("drag-over");
    }

    async onDropOnProject(ev, destProjectId) {
        ev.preventDefault();
        ev.currentTarget.classList.remove("drag-over");
        this.activeDragProjectId = null;
        document.body.classList.remove("planage-dragging-sprint");
        try {
            const dataStr = ev.dataTransfer.getData("text/plain");
            if (!dataStr) return;
            const data = JSON.parse(dataStr);
            const { sprintId, projectId } = data;
            
            if (projectId !== destProjectId) {
                return;
            }
            
            await this.props.state.rpc("/planage/sprint/write", {
                sprint_id: sprintId,
                vals: { folder_id: false }
            });
            
            await this.props.onReloadSpaces();
            
            if (this.props.state.activeSprintId === sprintId) {
                await this.props.state.selectProject(destProjectId, sprintId);
            }
        } catch (e) {
            console.error("Failed to move sprint to project root", e);
            showToast(this.props.state, _t("Failed to move sprint. Please try again."), "error");
        }
    }

    openEditSprintModal(sprint, projectId) {
        this.props.state.editingSprintId = sprint.id;
        this.props.state.editingSprintName = sprint.name;
        this.props.state.editingSprintDateFrom = sprint.date_from ? sprint.date_from.replace(' ', 'T').substring(0, 16) : "";
        this.props.state.editingSprintDateTo = sprint.date_to ? sprint.date_to.replace(' ', 'T').substring(0, 16) : "";
        this.props.state.editingSprintColor = sprint.color || "#10b981";
        this.props.state.showEditSprintModal = true;
    }

    openInbox() {
        this.collapseAll();
        this.props.onSetView("inbox");
    }

    get hasUnsavedWork() {
        const s = this.props.state;
        return !!(
            (s.showNewSpaceModal && s.newSpaceName?.trim()) ||
            (s.showNewFolderModal && s.newFolderName?.trim()) ||
            (s.showNewProjectModal && s.newProjectName?.trim()) ||
            (s.showNewSprintModal && s.newSprintName?.trim()) ||
            (s.showNewTaskModal && s.newTaskName?.trim()) ||
            (s.showEditSprintModal && s.editingSprintName?.trim())
        );
    }

    refreshSystem() {
        if (!this.hasUnsavedWork) {
            window.location.reload();
            return;
        }
        this.dialog.add(ConfirmationDialog, {
            title: _t("Unsaved Changes"),
            body: _t("You have an unsaved form open. Refreshing will discard it. Continue?"),
            confirmLabel: _t("Refresh Anyway"),
            confirmClass: "btn-danger",
            confirm: () => window.location.reload(),
            cancel: () => {},
        });
    }
}
