/** @odoo-module **/

import { Component, useState, onMounted, onWillUnmount } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { rpc } from "@web/core/network/rpc";

export class PlanageSystrayItem extends Component {
    static template = "planage.PlanageSystrayItem";
    static components = { Dropdown };

    setup() {
        this.rpc = rpc;
        this.action = useService("action");
        this.state = useState({
            notifications: [],
            unreadCount: 0,
        });

        onMounted(() => {
            this.fetchNotifications();
            // Sync with backend every 15 seconds so if read in app, badge clears
            this._pollInterval = setInterval(() => this.fetchNotifications(), 15000);
        });

        onWillUnmount(() => {
            clearInterval(this._pollInterval);
        });
    }

    async fetchNotifications() {
        try {
            const data = await this.rpc("/planage/notifications", {});
            // Only keep unread notifications for the tray
            this.state.notifications = data.filter(n => !n.read);
            this.state.unreadCount = this.state.notifications.length;
        } catch (e) {
            console.error("Planage Systray failed to fetch notifications", e);
        }
    }

    async onBeforeOpen() {
        await this.fetchNotifications();
    }

    async openPlanage(notif) {
        if (notif && notif.id) {
            try {
                // Mark as read in backend
                await this.rpc("/planage/notification/write", { notification_id: notif.id, vals: { read: true } });
                // Remove from tray dynamically
                this.state.notifications = this.state.notifications.filter(n => n.id !== notif.id);
                this.state.unreadCount = Math.max(0, this.state.unreadCount - 1);
            } catch (e) {
                console.error(e);
            }
        }
        this.action.doAction('planage.action_planage_app');
    }

    async markAllAsRead() {
        try {
            await this.rpc("/planage/notification/mark_all_read", {});
            await this.fetchNotifications();
        } catch (e) {
            console.error(e);
        }
    }
}

registry.category("systray").add("planage.systray", {
    Component: PlanageSystrayItem,
}, { sequence: 15 });
