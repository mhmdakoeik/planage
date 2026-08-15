/** @odoo-module **/

import { Component, useState } from "@odoo/owl";

export class NotificationsView extends Component {
    static template = "planage.NotificationsView";

    setup() {
        this.state = useState({
            currentPage: 1,
            pageSize: 5,
        });
    }

    get notifications() {
        return (this.props.state.notifications || []).filter(n => n.type !== 'inbox');
    }

    get totalPages() {
        return Math.ceil(this.notifications.length / this.state.pageSize) || 1;
    }

    get paginatedNotifications() {
        const start = (this.state.currentPage - 1) * this.state.pageSize;
        return this.notifications.slice(start, start + this.state.pageSize);
    }

    nextPage() {
        if (this.state.currentPage < this.totalPages) {
            this.state.currentPage++;
        }
    }

    prevPage() {
        if (this.state.currentPage > 1) {
            this.state.currentPage--;
        }
    }

    async markAllAsRead() {
        if (this.props.state.markAllNotificationsRead) {
            await this.props.state.markAllNotificationsRead();
        } else {
            // Fallback local mutation
            this.notifications.forEach(n => { n.read = true; });
            this.props.state.unreadNotificationsCount = 0;
        }
    }

    async markAsRead(notificationId) {
        if (this.props.state.markNotificationRead) {
            await this.props.state.markNotificationRead(notificationId);
        } else {
            // Fallback local mutation
            const notif = this.notifications.find(n => n.id === notificationId);
            if (notif && !notif.read) {
                notif.read = true;
                this.props.state.unreadNotificationsCount = Math.max(0, this.props.state.unreadNotificationsCount - 1);
            }
        }
    }
}
