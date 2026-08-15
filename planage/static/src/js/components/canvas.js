/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { ListView } from "../views/list_view";
import { BoardView } from "../views/board_view";
import { CalendarView } from "../views/calendar_view";
import { GanttView } from "../views/gantt_view";
import { ChatView } from "../views/chat_view";
import { DocsView } from "../views/docs_view";
import { DashboardView } from "../views/dashboard_view";
import { NotificationsView } from "../views/notifications_view";
import { ConfigView } from "../views/config_view";
import { InboxView } from "../views/inbox_view";
import { ReportingView } from "../views/reporting_view";

/**
 * Canvas — The central interactive work area.
 * Switches between active views (Tasks, Board, Calendar, Gantt, Chat, Docs, Dashboard, Notifications, Config, Everything, Inbox)
 * based on state.activeView.
 */
export class Canvas extends Component {
    static template = "planage.Canvas";
    static components = { ListView, BoardView, CalendarView, GanttView, ChatView, DocsView, DashboardView, NotificationsView, ConfigView, InboxView, ReportingView };

    setup() {
        this.state = useState({
            searchQuery: "",
            accessFilter: "all", // all | public | restricted
            sortBy: "name",      // name | projects | members
            everythingPage: 1,
            spaceProjectsPage: 1,
        });
    }

    get activeView() {
        return this.props.state.activeView;
    }

    get activeProjectId() {
        return this.props.state.activeProjectId;
    }

    get tasks() {
        return this.props.state.tasks;
    }

    get stages() {
        return this.props.state.stages;
    }

    get chatMessages() {
        return this.props.state.chatMessages || [];
    }

    get hasActiveProject() {
        return !!this.activeProjectId;
    }

    setView(view) {
        this.props.onSetView(view);
    }

    get spaces() {
        return this.props.state.spaces || [];
    }

    get filteredSpaces() {
        let spacesList = [...this.spaces];
        const query = (this.state.searchQuery || "").trim().toLowerCase();
        if (query) {
            spacesList = spacesList.filter(s => s.name.toLowerCase().includes(query));
        }

        const access = this.state.accessFilter;
        if (access === "public") {
            spacesList = spacesList.filter(s => !s.user_ids || s.user_ids.length === 0);
        } else if (access === "restricted") {
            spacesList = spacesList.filter(s => s.user_ids && s.user_ids.length > 0);
        }

        const sort = this.state.sortBy;
        if (sort === "name") {
            spacesList.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sort === "projects") {
            spacesList.sort((a, b) => (b.projects || []).length - (a.projects || []).length);
        } else if (sort === "members") {
            spacesList.sort((a, b) => ((b.user_ids || []).length) - ((a.user_ids || []).length));
        }
 
        return spacesList;
    }
 
    getSpaceUsers(userIds) {
        if (!userIds || !userIds.length) return [];
        const allUsers = this.props.state.users || [];
        return allUsers.filter(u => userIds.includes(u.id)).slice(0, 4);
    }
 
    selectSpaceAndOpen(spaceId) {
        this.props.onSelectSpace(spaceId);
        const space = this.spaces.find(s => s.id === spaceId);
        let firstProj = null;
        if (space && space.projects && space.projects.length > 0) {
            firstProj = space.projects[0];
        }
        if (firstProj) {
            this.props.state.selectProject(firstProj.id);
        }
    }
 
    selectProjectAndOpen(projectId, spaceId) {
        this.props.onSelectSpace(spaceId);
        this.props.state.selectProject(projectId);
    }

    get activeSpace() {
        const spaceId = this.props.state.activeSpaceId;
        if (!spaceId) return null;
        return this.spaces.find(s => s.id === spaceId);
    }

    get spaceProjects() {
        const space = this.activeSpace;
        if (!space || !space.projects) return [];
        
        let list = [...space.projects];
        
        // 1. Search Query
        const query = (this.state.searchQuery || "").trim().toLowerCase();
        if (query) {
            list = list.filter(p => p.name.toLowerCase().includes(query));
        }
        
        // 2. Access Filter
        const access = this.state.accessFilter;
        if (access === "restricted") {
            const currentUserId = this.props.state.currentUserId;
            list = list.filter(p => p.user_ids && p.user_ids.includes(currentUserId));
        } else if (access === "public") {
            list = list.filter(p => !p.user_ids || p.user_ids.length === 0);
        }
        
        // 3. Sort
        const sort = this.state.sortBy;
        if (sort === "name") {
            list.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sort === "projects") {
            list.sort((a, b) => (b.task_count || 0) - (a.task_count || 0));
        } else if (sort === "members") {
            list.sort((a, b) => (b.user_ids ? b.user_ids.length : 0) - (a.user_ids ? a.user_ids.length : 0));
        }
        
        return list;
    }

    get activeProject() {
        const projectId = this.activeProjectId;
        if (!projectId) return null;
        for (const space of this.spaces) {
            if (space.projects) {
                const proj = space.projects.find(p => p.id === projectId);
                if (proj) return proj;
            }
        }
        return null;
    }

    get activeProjectSprints() {
        const proj = this.activeProject;
        if (!proj) return [];
        
        let allSprints = [];
        if (proj.sprints) {
            allSprints = allSprints.concat(proj.sprints.map(s => ({
                ...s,
                folderName: null
            })));
        }
        if (proj.folders) {
            for (const folder of proj.folders) {
                if (folder.sprints) {
                    allSprints = allSprints.concat(folder.sprints.map(s => ({
                        ...s,
                        folderName: folder.name
                    })));
                }
            }
        }
        return allSprints;
    }

    selectSprint(sprintId) {
        if (this.activeProjectId) {
            this.props.state.selectProject(this.activeProjectId, sprintId);
        }
    }

    get totalEverythingPages() {
        return Math.ceil(this.filteredSpaces.length / 6) || 1;
    }

    get pagedSpaces() {
        const page = this.state.everythingPage || 1;
        const pageSize = 6;
        const start = (page - 1) * pageSize;
        return this.filteredSpaces.slice(start, start + pageSize);
    }

    updateSearchQuery(ev) {
        this.state.searchQuery = ev.target.value;
        this.state.everythingPage = 1;
        this.state.spaceProjectsPage = 1;
    }

    updateAccessFilter(ev) {
        this.state.accessFilter = ev.target.value;
        this.state.everythingPage = 1;
        this.state.spaceProjectsPage = 1;
    }

    updateSortBy(ev) {
        this.state.sortBy = ev.target.value;
        this.state.everythingPage = 1;
        this.state.spaceProjectsPage = 1;
    }

    changeEverythingPage(dir) {
        const nextPage = this.state.everythingPage + dir;
        if (nextPage >= 1 && nextPage <= this.totalEverythingPages) {
            this.state.everythingPage = nextPage;
        }
    }

    willUpdateProps(nextProps) {
        if (nextProps.state.activeSpaceId !== this.props.state.activeSpaceId) {
            this.state.spaceProjectsPage = 1;
        }
    }

    get totalSpaceProjectsPages() {
        return Math.ceil(this.spaceProjects.length / 6) || 1;
    }

    get pagedSpaceProjects() {
        const page = this.state.spaceProjectsPage || 1;
        const pageSize = 6;
        const start = (page - 1) * pageSize;
        return this.spaceProjects.slice(start, start + pageSize);
    }

    changeSpaceProjectsPage(dir) {
        const nextPage = this.state.spaceProjectsPage + dir;
        if (nextPage >= 1 && nextPage <= this.totalSpaceProjectsPages) {
            this.state.spaceProjectsPage = nextPage;
        }
    }
}
