import { Component, useState, useEffect, onMounted, onWillUnmount, xml } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { rpc } from "@web/core/network/rpc";
import { user } from "@web/core/user";
import { _t } from "@web/core/l10n/translation";
import { Sidebar } from "./components/sidebar";
import { Canvas } from "./components/canvas";
import { RightDrawer } from "./components/right_drawer";
import { showToast } from "./utils/toast";
import { findSprintById } from "./utils/sprint";
import { applyTheme, getStoredTheme } from "./utils/theme";

export class PlanageApp extends Component {
    static template = "planage.PlanageApp";
    static components = { Sidebar, Canvas, RightDrawer };

    setup() {
        this.rpc = rpc;
        this.notification = useService("notification");

        // Initialize theme preference
        const isDark = getStoredTheme();
        document.body.classList.toggle("dark-theme", isDark);

        const savedView = localStorage.getItem("planage-active-view") || "dashboard";
        const savedSpaceId = parseInt(localStorage.getItem("planage-active-space-id")) || null;
        const savedProjectId = parseInt(localStorage.getItem("planage-active-project-id")) || null;
        const savedSprintId = parseInt(localStorage.getItem("planage-active-sprint-id")) || null;

        this.state = useState({
            isDark: isDark,
            currentUserId: user.userId,
            // Navigation state
            spaces: [],
            activeSpaceId: savedSpaceId,
            activeProjectId: savedProjectId,
            activeSprintId: savedSprintId,
            activeView: savedView,          // dashboard | tasks | board | calendar | gantt | docs | config | everything | my_tasks | notifications | reporting
            activeTaskId: null,
            rpc: rpc,
            writeSpace: this.writeSpace.bind(this),
            writeProject: this.writeProject.bind(this),
            selectProject: this.selectProject.bind(this),
            openSpaceModal: this.openSpaceModal.bind(this),
            openFolderModal: this.openFolderModal.bind(this),
            openProjectModal: this.openProjectModal.bind(this),
            openSprintModal: this.openSprintModal.bind(this),
            openTaskModal: this.openTaskModal.bind(this),
            markNotificationRead: this.markNotificationRead.bind(this),
            markAllNotificationsRead: this.markAllNotificationsRead.bind(this),
            selectInboxChannel: this.selectInboxChannel.bind(this),
            createInboxChannel: this.createInboxChannel.bind(this),
            postInboxMessage: this.postInboxMessage.bind(this),
            leaveInboxChannel: this.leaveInboxChannel.bind(this),
            deleteInboxChannel: this.deleteInboxChannel.bind(this),

            // Global unified creation modals
            showFabMenu: false,
            showNewSpaceModal: false,
            showNewFolderModal: false,
            showNewProjectModal: false,
            showNewSprintModal: false,
            showNewTaskModal: false,
            showEditSprintModal: false,

            editingSprintId: null,
            editingSprintName: "",
            editingSprintDateFrom: "",
            editingSprintDateTo: "",
            editingSprintColor: "",

            newSpaceName: "",
            newSpaceColor: "#6366f1",
            newSpaceIcon: "🚀",
            selectedUserIds: {},

            newFolderName: "",
            newFolderSpaceId: "",
            newFolderProjectId: "",
            newFolderColor: "#8b5cf6",

            newProjectName: "",
            newProjectSpaceId: "",
            newProjectColor: "#3b82f6",

            newSprintName: "",
            newSprintProjectId: "",
            newSprintFolderId: "",
            newSprintDateFrom: "",
            newSprintDateTo: "",
            newSprintColor: "#10b981",

            newTaskName: "",
            newTaskProjectId: "",
            newTaskSprintId: "",
            newTaskPriority: "0",
            newTaskColor: "#6366f1",

            // Layout toggles
            sidebarCollapsed: false,
            drawerOpen: false,

            // Data
            tasks: [],
            stages: [],
            chatMessages: [],
            documents: [],
            users: [],
            notifications: [],
            unreadNotificationsCount: 0,
            unreadInboxNotificationsCount: 0,
            inboxMessages: [],
            inboxChannels: [],
            activeInboxChannelId: null,
            isAdmin: false,
            isManager: false,
            devMode: false,

            // UI
            loading: true,
            toastMessage: null,
            toastType: "info",          // info | success | error | warning
        });

        // Click outside listener for FAB menu auto-dismissal
        const handleWindowClick = (event) => {
            const fabContainer = document.querySelector('.planage-fab-container');
            if (this.state.showFabMenu && fabContainer && !fabContainer.contains(event.target)) {
                this.state.showFabMenu = false;
            }
        };

        onMounted(async () => {
            window.addEventListener("click", handleWindowClick);
            await this._loadPermissions();
            await this._loadSpaces();
            await this._loadUsers();
            await this.loadDocuments();
            await this.loadNotifications();
            
            // Re-trigger data loading for standalone views if restored from localStorage
            if (["my_tasks", "inbox"].includes(this.state.activeView)) {
                await this.setView(this.state.activeView);
            }

            // Background polling for Inbox and Notifications (every 5 seconds)
            this.syncInterval = setInterval(() => {
                this.loadNotifications();
                if (this.state.activeView === "inbox") {
                    this.loadInboxChannels();
                }
            }, 5000);
        });

        onWillUnmount(() => {
            window.removeEventListener("click", handleWindowClick);
            if (this.syncInterval) clearInterval(this.syncInterval);
        });
    }

    // ─── Data Loaders ────────────────────────────────────────────

    async _loadPermissions() {
        try {
            const data = await this.rpc("/planage/permissions", {});
            this.state.isManager = data.is_manager || false;
            this.state.isAdmin = data.is_admin || false;
            this.state.devMode = data.dev_mode || false;
        } catch (e) {
            console.error("Failed to load permissions", e);
            this._showToast(_t("Failed to load your permissions. Some features may be hidden."), "error");
        }
    }

    async _loadSpaces() {
        try {
            const spaces = await this.rpc("/planage/spaces", {});
            this.state.spaces = spaces;
            if (this.state.activeProjectId) {
                // Restore data for the saved project without overriding the active view
                await this.selectProject(this.state.activeProjectId, this.state.activeSprintId, true);
            }
        } catch (e) {
            this._showToast(_t("Failed to load workspaces. Please refresh."), "error");
        } finally {
            this.state.loading = false;
        }
    }

    async _loadUsers() {
        try {
            const users = await this.rpc("/planage/users", {});
            this.state.users = users;
        } catch (e) {
            console.error("Failed to load users", e);
        }
    }

    async loadTasks(projectId, sprintId = null) {
        try {
            const params = { project_id: projectId };
            if (sprintId) {
                params.sprint_id = sprintId;
            }
            const tasks = await this.rpc("/planage/tasks", params);
            this.state.tasks = tasks;
        } catch (e) {
            this._showToast(_t("Failed to load tasks."), "error");
        }
    }

    async loadStages(projectId) {
        try {
            const stages = await this.rpc("/planage/stages", { project_id: projectId });
            this.state.stages = stages;
        } catch (e) {
            console.warn("Could not load stages", e);
        }
    }

    async loadChatMessages(projectId) {
        if (!projectId) return;
        try {
            const messages = await this.rpc("/planage/chat/messages", { project_id: projectId });
            this.state.chatMessages = messages;
        } catch (e) {
            console.warn("Could not load chat messages", e);
        }
    }

    async postChatMessage(body, isAssigned = false) {
        if (!this.state.activeProjectId) return;
        try {
            const newMsg = await this.rpc("/planage/chat/message/create", {
                project_id: this.state.activeProjectId,
                body,
                is_assigned: isAssigned,
            });
            this.state.chatMessages.push(newMsg);
            await this.loadDocuments();
        } catch (e) {
            this._showToast(_t("Failed to post message."), "error");
        }
    }

    async loadInboxChannels() {
        try {
            const data = await this.rpc("/planage/inbox/channels", {});
            const channels = data.channels || [];
            this.state.inboxChannels = channels;
            this.state.isAdmin = data.is_admin || false;
            if (channels.length > 0 && !this.state.activeInboxChannelId) {
                await this.selectInboxChannel(channels[0].id);
            } else if (this.state.activeInboxChannelId) {
                const exists = channels.some(c => c.id === this.state.activeInboxChannelId);
                if (exists) {
                    await this.loadInboxMessages(this.state.activeInboxChannelId);
                } else if (channels.length > 0) {
                    await this.selectInboxChannel(channels[0].id);
                } else {
                    this.state.activeInboxChannelId = null;
                    this.state.inboxMessages = [];
                }
            } else {
                this.state.inboxMessages = [];
            }
        } catch (e) {
            console.error("Failed to load inbox channels", e);
        }
    }

    async selectInboxChannel(channelId) {
        this.state.activeInboxChannelId = channelId;
        await this.loadInboxMessages(channelId);
    }

    async loadInboxMessages(channelId) {
        try {
            const messages = await this.rpc("/planage/inbox/messages", { channel_id: channelId });
            this.state.inboxMessages = messages;
        } catch (e) {
            console.error("Failed to load inbox messages", e);
        }
    }

    async postInboxMessage(body) {
        if (!this.state.activeInboxChannelId) return;
        try {
            const newMsg = await this.rpc("/planage/inbox/message/create", {
                channel_id: this.state.activeInboxChannelId,
                body: body
            });
            this.state.inboxMessages.push(newMsg);
        } catch (e) {
            this._showToast(_t("Failed to post message to inbox."), "error");
        }
    }

    async createInboxChannel(channelType, name, memberIds) {
        try {
            const channel = await this.rpc("/planage/inbox/channel/create", {
                channel_type: channelType,
                name: name,
                member_ids: memberIds
            });
            await this.loadInboxChannels();
            await this.selectInboxChannel(channel.id);
            this._showToast(
                channelType === "dm" ? _t("Chat started!") : _t('Channel "%(name)s" created.', { name }),
                "success"
            );
        } catch (e) {
            this._showToast(_t("Failed to create conversation."), "error");
        }
    }

    async leaveInboxChannel(channelId) {
        try {
            await this.rpc("/planage/inbox/channel/leave", { channel_id: channelId });
            this.state.activeInboxChannelId = null;
            await this.loadInboxChannels();
            this._showToast(_t("Left conversation."), "success");
        } catch (e) {
            this._showToast(_t("Failed to leave conversation."), "error");
        }
    }

    async deleteInboxChannel(channelId) {
        try {
            const res = await this.rpc("/planage/inbox/channel/delete", { channel_id: channelId });
            if (res.error) {
                this._showToast(res.error, "error");
            } else {
                this.state.activeInboxChannelId = null;
                await this.loadInboxChannels();
                this._showToast(_t("Channel deleted."), "success");
            }
        } catch (e) {
            this._showToast(_t("Failed to delete channel."), "error");
        }
    }

    async loadDocuments() {
        try {
            const docs = await this.rpc("/planage/documents", {});
            this.state.documents = docs;
        } catch (e) {
            console.warn("Could not load documents", e);
        }
    }

    async loadNotifications() {
        try {
            const notifications = await this.rpc("/planage/notifications", {});
            this.state.notifications = notifications;
            this.state.unreadNotificationsCount = notifications.filter(n => !n.read && n.type !== 'inbox').length;
            this.state.unreadInboxNotificationsCount = notifications.filter(n => !n.read && n.type === 'inbox').length;
        } catch (e) {
            console.warn("Could not load notifications", e);
        }
    }

    async markNotificationRead(notificationId) {
        const notif = this.state.notifications.find(n => n.id === notificationId);
        if (notif && !notif.read) {
            notif.read = true;
            this.state.unreadNotificationsCount = Math.max(0, this.state.unreadNotificationsCount - 1);
            try {
                await this.rpc("/planage/notification/write", {
                    notification_id: notificationId,
                    vals: { read: true },
                });
            } catch (e) {
                console.warn("Failed to mark notification read", e);
            }
        }
    }

    async markAllNotificationsRead() {
        this.state.notifications.forEach(n => (n.read = true));
        this.state.unreadNotificationsCount = 0;
        try {
            await this.rpc("/planage/notification/mark_all_read", {});
        } catch (e) {
            console.warn("Failed to mark all notifications read", e);
        }
    }

    async writeProject(projectId, vals) {
        try {
            const project = await this.rpc("/planage/project/write", {
                project_id: projectId,
                vals,
            });
            await this._loadSpaces();
            // Reload notifications in case assignment triggered one
            await this.loadNotifications();
            this._showToast(_t('Project "%(name)s" access settings updated.', { name: project.name }), "success");
        } catch (e) {
            this._showToast(_t("Failed to update project access settings."), "error");
        }
    }



    // ─── Navigation Handlers ──────────────────────────────────────

    async selectProject(projectId, sprintId = null, keepView = false) {
        if (projectId === null) {
            this.state.activeSpaceId = null;
            this.state.activeProjectId = null;
            this.state.activeSprintId = null;
            this.state.activeTaskId = null;
            this.state.drawerOpen = false;
            this.state.activeView = "everything";
            return;
        }
        this.state.activeProjectId = projectId;
        this.state.activeSprintId = sprintId;
        this.state.activeTaskId = null;
        this.state.drawerOpen = false;
        if (!keepView && !["tasks", "board", "calendar", "gantt", "chat"].includes(this.state.activeView)) {
            this.state.activeView = "tasks";
        }
        
        // Persist state
        localStorage.setItem("planage-active-space-id", this.state.activeSpaceId || "");
        localStorage.setItem("planage-active-project-id", this.state.activeProjectId || "");
        localStorage.setItem("planage-active-sprint-id", this.state.activeSprintId || "");
        localStorage.setItem("planage-active-view", this.state.activeView);
        
        await this.loadTasks(projectId, sprintId);
        await this.loadStages(projectId);
        await this.loadChatMessages(projectId);
    }

    selectSpace(spaceId) {
        this.state.activeSpaceId = spaceId;
        this.state.activeProjectId = null;
        this.state.activeSprintId = null;
        this.state.activeTaskId = null;
        this.state.drawerOpen = false;
        this.state.activeView = "tasks";
        
        // Persist state
        localStorage.setItem("planage-active-space-id", this.state.activeSpaceId || "");
        localStorage.setItem("planage-active-project-id", "");
        localStorage.setItem("planage-active-sprint-id", "");
        localStorage.setItem("planage-active-view", "tasks");
    }

    async setView(view) {
        if (view === "chat") {
            await this.loadChatMessages(this.state.activeProjectId);
        } else if (view === "docs") {
            await this.loadDocuments();
        } else if (view === "my_tasks") {
            this.state.activeProjectId = null;
            this.state.activeSprintId = null;
            this.state.loading = true;
            try {
                const tasks = await this.rpc("/planage/tasks", { assigned_to_me: true });
                this.state.tasks = tasks;
                const stages = await this.rpc("/planage/stages", {});
                this.state.stages = stages;
            } catch (e) {
                this._showToast(_t("Failed to load personal tasks."), "error");
            } finally {
                this.state.loading = false;
            }
        } else if (view === "inbox") {
            this.state.activeSpaceId = null;
            this.state.activeProjectId = null;
            this.state.activeSprintId = null;
            this.state.loading = true;
            try {
                await this.loadInboxChannels();
                
                // Mark all inbox notifications as read
                const unreadInbox = (this.state.notifications || []).filter(n => n.type === 'inbox' && !n.read);
                if (unreadInbox.length > 0) {
                    unreadInbox.forEach(n => (n.read = true));
                    this.state.unreadInboxNotificationsCount = 0;
                    await this.rpc("/planage/notification/mark_inbox_read", {});
                }
            } finally {
                this.state.loading = false;
            }
        }
        this.state.activeView = view;
        this.state.drawerOpen = false;
        
        // Persist state
        localStorage.setItem("planage-active-view", view);
    }

    async openTask(taskId) {
        this.state.activeTaskId = taskId;
        this.state.drawerOpen = true;
    }

    closeDrawer() {
        this.state.drawerOpen = false;
        this.state.activeTaskId = null;
    }

    toggleSidebar() {
        this.state.sidebarCollapsed = !this.state.sidebarCollapsed;
    }

    // ─── Task Mutations ───────────────────────────────────────────

    _calculateProgressForStage(stageId) {
        const stages = this.state.stages || [];
        const stageSequence = stages.map(s => s.id);
        const targetId = stageId ? parseInt(stageId) : null;
        const index = stageSequence.indexOf(targetId);
        if (index === -1) return 0;
        if (stageSequence.length <= 1) return 0;
        return Math.round((index / (stageSequence.length - 1)) * 100);
    }

    updateTaskInState(updatedTask) {
        const taskIdx = this.state.tasks.findIndex((t) => t.id === updatedTask.id);
        if (taskIdx >= 0) {
            this.state.tasks[taskIdx] = updatedTask;
        }
    }

    async writeTask(taskId, vals, revertVals = null) {
        if ('stage_id' in vals) {
            vals.progress = this._calculateProgressForStage(vals.stage_id);
        }

        const taskIdx = this.state.tasks.findIndex((t) => t.id === taskId);
        const prevState = taskIdx >= 0 ? { ...this.state.tasks[taskIdx] } : null;

        if (taskIdx >= 0) {
            Object.assign(this.state.tasks[taskIdx], vals);
        }

        try {
            const updated = await this.rpc("/planage/task/write", { task_id: taskId, vals });
            if (taskIdx >= 0) {
                this.state.tasks[taskIdx] = updated;
            }
        } catch (e) {
            if (prevState && taskIdx >= 0) {
                this.state.tasks[taskIdx] = prevState;
            }
            this._showToast(_t("Update failed. Changes have been reverted."), "error");
        }
    }

    async createTask(name, stageId = null, projectId = null, sprintId = null, dateStart = null, dateEnd = null) {
        const pId = projectId ? parseInt(projectId) : this.state.activeProjectId;
        const sId = sprintId ? parseInt(sprintId) : this.state.activeSprintId;
        if (!pId || !name.trim()) return;
        try {
            const initialProgress = this._calculateProgressForStage(stageId);
            const params = {
                project_id: pId,
                name: name.trim(),
                stage_id: stageId,
                progress: initialProgress,
            };
            if (sId) {
                params.sprint_id = sId;
            }
            if (dateStart) {
                params.date_start = `${dateStart} 00:00:00`;
            }
            if (dateEnd) {
                params.date_end = `${dateEnd} 00:00:00`;
            }
            const task = await this.rpc("/planage/task/create", params);
            if (this.state.activeProjectId === pId) {
                this.state.tasks.push(task);
            }
            this._showToast(_t('Task "%(name)s" created.', { name: task.name }), "success");
        } catch (e) {
            this._showToast(_t("Failed to create task."), "error");
        }
    }

    async deleteTask(taskId) {
        const prev = [...this.state.tasks];
        this.state.tasks = this.state.tasks.filter((t) => t.id !== taskId);
        try {
            await this.rpc("/planage/task/delete", { task_id: taskId });
        } catch (e) {
            this.state.tasks = prev;
            this._showToast(_t("Failed to delete task."), "error");
        }
    }

    // ─── Global Unified Creation Handlers ─────────────────────────

    async createSpace(name, color, icon, userIds = []) {
        try {
            const params = { name, color, icon };
            if (userIds.length > 0) {
                params.user_ids = userIds;
            }
            const space = await this.rpc("/planage/space/create", params);
            await this._loadSpaces();
            this._showToast(_t('Space "%(name)s" created!', { name: space.name }), "success");
        } catch (e) {
            this._showToast(_t("Failed to create space."), "error");
        }
    }

    async writeSpace(spaceId, vals) {
        try {
            const space = await this.rpc("/planage/space/write", { space_id: spaceId, vals });
            await this._loadSpaces();
            // Reload notifications in case assignment triggered one
            await this.loadNotifications();
            this._showToast(_t('Space "%(name)s" access settings updated.', { name: space.name }), "success");
        } catch (e) {
            this._showToast(_t("Failed to update space access settings."), "error");
        }
    }


    async createFolder(spaceId, projectId, name, color) {
        try {
            const folder = await this.rpc("/planage/folder/create", {
                space_id: parseInt(spaceId),
                project_id: parseInt(projectId),
                name: name.trim(),
                color,
            });
            await this._loadSpaces();
            this._showToast(_t('Folder "%(name)s" created!', { name: folder.name }), "success");
        } catch (e) {
            this._showToast(_t("Failed to create folder."), "error");
        }
    }

    async createProject(spaceId, name, color) {
        try {
            const params = {
                space_id: parseInt(spaceId),
                name: name.trim(),
                color,
            };
            const project = await this.rpc("/planage/project/create", params);
            await this._loadSpaces();
            this._showToast(_t('Project "%(name)s" created!', { name: project.name }), "success");
        } catch (e) {
            this._showToast(_t("Failed to create project."), "error");
        }
    }

    async createSprint(projectId, name, dateFrom, dateTo, color, folderId = null) {
        try {
            const params = {
                project_id: parseInt(projectId),
                name: name.trim(),
                date_from: dateFrom,
                date_to: dateTo,
                color,
            };
            if (folderId) {
                params.folder_id = parseInt(folderId);
            }
            const sprint = await this.rpc("/planage/sprint/create", params);
            await this._loadSpaces();
            this._showToast(_t('Sprint "%(name)s" created!', { name: sprint.name }), "success");
        } catch (e) {
            this._showToast(_t("Failed to create sprint."), "error");
        }
    }

    // ─── Modal Open/Close Toggles ─────────────────────────────────

    openSpaceModal() {
        this.state.newSpaceName = "";
        this.state.newSpaceColor = "#6366f1";
        this.state.newSpaceIcon = "🚀";
        this.state.selectedUserIds = {};
        this.state.showNewSpaceModal = true;
        this.state.showFabMenu = false;
    }
    closeSpaceModal() { this.state.showNewSpaceModal = false; }
    async confirmCreateSpace() {
        if (!this.state.newSpaceName.trim()) return;
        const userIds = Object.keys(this.state.selectedUserIds)
            .filter((id) => this.state.selectedUserIds[id])
            .map(Number);
        await this.createSpace(
            this.state.newSpaceName.trim(),
            this.state.newSpaceColor,
            this.state.newSpaceIcon,
            userIds
        );
        this.closeSpaceModal();
    }
    toggleNewSpaceUser(userId) {
        this.state.selectedUserIds[userId] = !this.state.selectedUserIds[userId];
    }

    openFolderModal() {
        this.state.newFolderName = "";
        this.state.newFolderSpaceId = this.state.activeSpaceId || (this.state.spaces[0] ? this.state.spaces[0].id : "");
        this.state.newFolderProjectId = "";
        this.state.newFolderColor = "#8b5cf6";
        this.state.showNewFolderModal = true;
        this.state.showFabMenu = false;
    }
    closeFolderModal() { this.state.showNewFolderModal = false; }
    async confirmCreateFolder() {
        if (!this.state.newFolderName.trim() || !this.state.newFolderSpaceId || !this.state.newFolderProjectId) return;
        await this.createFolder(
            this.state.newFolderSpaceId,
            this.state.newFolderProjectId,
            this.state.newFolderName.trim(),
            this.state.newFolderColor
        );
        this.closeFolderModal();
    }

    openProjectModal() {
        this.state.newProjectName = "";
        this.state.newProjectSpaceId = this.state.activeSpaceId || (this.state.spaces[0] ? this.state.spaces[0].id : "");
        this.state.newProjectColor = "#3b82f6";
        this.state.showNewProjectModal = true;
        this.state.showFabMenu = false;
    }
    closeProjectModal() { this.state.showNewProjectModal = false; }
    async confirmCreateProject() {
        if (!this.state.newProjectName.trim() || !this.state.newProjectSpaceId) return;
        await this.createProject(
            this.state.newProjectSpaceId,
            this.state.newProjectName.trim(),
            this.state.newProjectColor
        );
        this.closeProjectModal();
    }

    openSprintModal() {
        this.state.newSprintName = "";
        this.state.newSprintProjectId = this.state.activeProjectId || "";
        this.state.newSprintFolderId = "";
        this.state.newSprintDateFrom = "";
        this.state.newSprintDateTo = "";
        this.state.newSprintColor = "#10b981";
        this.state.showNewSprintModal = true;
        this.state.showFabMenu = false;
    }
    closeSprintModal() { this.state.showNewSprintModal = false; }
    async confirmCreateSprint() {
        if (!this.state.newSprintName.trim() || !this.state.newSprintProjectId) return;
        if (!this.state.newSprintDateFrom || !this.state.newSprintDateTo) {
            this._showToast(_t("Start and end dates are required."), "error");
            return;
        }
        await this.createSprint(
            this.state.newSprintProjectId,
            this.state.newSprintName.trim(),
            this.state.newSprintDateFrom.replace('T', ' '),
            this.state.newSprintDateTo.replace('T', ' '),
            this.state.newSprintColor,
            this.state.newSprintFolderId || null
        );
        this.closeSprintModal();
    }

    closeEditSprintModal() {
        this.state.showEditSprintModal = false;
        this.state.editingSprintId = null;
    }

    async confirmEditSprint() {
        if (!this.state.editingSprintName.trim() || !this.state.editingSprintId) return;
        
        let dateFrom = this.state.editingSprintDateFrom;
        let dateTo = this.state.editingSprintDateTo;
        if (dateFrom) dateFrom = dateFrom.replace('T', ' ');
        if (dateTo) dateTo = dateTo.replace('T', ' ');
        
        try {
            await this.rpc("/planage/sprint/write", {
                sprint_id: this.state.editingSprintId,
                vals: {
                    name: this.state.editingSprintName.trim(),
                    date_from: dateFrom,
                    date_to: dateTo,
                    color: this.state.editingSprintColor,
                }
            });
            await this._loadSpaces();
            this._showToast(_t("Sprint updated successfully."), "success");
        } catch (e) {
            this._showToast(_t("Failed to update sprint."), "error");
        }
        this.closeEditSprintModal();
    }

    openTaskModal() {
        this.state.newTaskName = "";
        this.state.newTaskProjectId = this.state.activeProjectId || "";
        this.state.newTaskSprintId = this.state.activeSprintId || "";
        this.state.newTaskPriority = "0";
        this.state.newTaskColor = "#6366f1";
        this.state.newTaskStartDate = "";
        this.state.newTaskEndDate = "";
        this.state.showNewTaskModal = true;
        this.state.showFabMenu = false;
    }
    closeTaskModal() { this.state.showNewTaskModal = false; }
    async confirmCreateTask() {
        if (!this.state.newTaskName.trim() || !this.state.newTaskProjectId) return;
        await this.createTask(
            this.state.newTaskName.trim(),
            null, // stageId
            this.state.newTaskProjectId,
            this.state.newTaskSprintId || null,
            this.state.newTaskStartDate || null,
            this.state.newTaskEndDate || null
        );
        this.closeTaskModal();
    }

    // ─── Toast Notifications ──────────────────────────────────────

    _showToast(message, type = "info") {
        showToast(this.state, message, type);
    }

    get activeTask() {
        return this.state.tasks.find((t) => t.id === this.state.activeTaskId) || null;
    }

    get activeSprint() {
        return findSprintById(this.state.spaces, this.state.activeSprintId);
    }
}

registry.category("actions").add("planage_app", PlanageApp);
