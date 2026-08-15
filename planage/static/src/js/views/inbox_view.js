/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { showToast } from "../utils/toast";

export class InboxView extends Component {
    static template = "planage.InboxView";

    setup() {
        this.dialog = useService("dialog");
        this.state = useState({
            newMessage: "",
            searchQuery: "",

            // Modal visibility
            showCreateChannelModal: false,
            showStartDmModal: false,

            // Channel form
            newChannelName: "",
            newChannelType: "public", // public | private
            selectedMembers: {},      // { userId: boolean }

            // DM form
            selectedDmUserId: "",

            // Mentions state
            showMentionsDropdown: false,
            mentionSearchQuery: "",
            mentionCursorIndex: -1,
            mentionStartIndex: -1,
            mentionSelectedIndex: 0,
        });
    }

    // --- Message Posting ---
    async postMessage() {
        if (!this.state.newMessage.trim()) return;
        await this.props.onPostInboxMessage(this.state.newMessage);
        this.state.newMessage = "";
        this.state.showMentionsDropdown = false;
    }

    onInput(ev) {
        const textarea = ev.target;
        const val = textarea.value;
        const selStart = textarea.selectionStart;
        
        const textBeforeCursor = val.substring(0, selStart);
        const lastAtIdx = textBeforeCursor.lastIndexOf("@");
        
        if (lastAtIdx !== -1) {
            const word = textBeforeCursor.substring(lastAtIdx + 1);
            if (!word.includes(" ") && !word.includes("\n")) {
                this.state.showMentionsDropdown = true;
                this.state.mentionSearchQuery = word;
                this.state.mentionStartIndex = lastAtIdx;
                this.state.mentionCursorIndex = selStart;
                
                const matches = this.matchingMembers;
                if (this.state.mentionSelectedIndex >= matches.length) {
                    this.state.mentionSelectedIndex = 0;
                }
                return;
            }
        }
        this.state.showMentionsDropdown = false;
    }

    onKeyDown(ev) {
        if (this.state.showMentionsDropdown && this.matchingMembers.length) {
            if (ev.key === "ArrowDown") {
                ev.preventDefault();
                this.state.mentionSelectedIndex = (this.state.mentionSelectedIndex + 1) % this.matchingMembers.length;
                return;
            } else if (ev.key === "ArrowUp") {
                ev.preventDefault();
                this.state.mentionSelectedIndex = (this.state.mentionSelectedIndex - 1 + this.matchingMembers.length) % this.matchingMembers.length;
                return;
            } else if (ev.key === "Enter" || ev.key === "Tab") {
                ev.preventDefault();
                this.insertMention(this.matchingMembers[this.state.mentionSelectedIndex]);
                return;
            } else if (ev.key === "Escape") {
                ev.preventDefault();
                this.state.showMentionsDropdown = false;
                return;
            }
        }

        if (ev.key === "Enter" && !ev.shiftKey) {
            ev.preventDefault();
            this.postMessage();
        }
    }

    insertMention(user) {
        const textarea = document.querySelector(".composer-input-wrapper .composer-textarea");
        if (!textarea) return;
        
        const val = this.state.newMessage;
        const startIdx = this.state.mentionStartIndex;
        const cursorIdx = this.state.mentionCursorIndex;
        
        const before = val.substring(0, startIdx);
        const after = val.substring(cursorIdx);
        
        const mentionText = `@${user.name} `;
        this.state.newMessage = before + mentionText + after;
        this.state.showMentionsDropdown = false;
        
        const newCursorPos = startIdx + mentionText.length;
        setTimeout(() => {
            textarea.focus();
            textarea.selectionStart = newCursorPos;
            textarea.selectionEnd = newCursorPos;
        }, 0);
    }

    get channelMembers() {
        const activeChan = this.activeChannel;
        if (!activeChan || !this.props.users) return [];
        
        const currentUserId = this.props.state.currentUserId;
        if (activeChan.channel_type === "public") {
            return this.props.users.filter(u => u.id !== currentUserId);
        } else {
            const memberIds = activeChan.member_ids || [];
            return this.props.users.filter(u => memberIds.includes(u.id) && u.id !== currentUserId);
        }
    }

    get matchingMembers() {
        const query = this.state.mentionSearchQuery.toLowerCase();
        const members = this.channelMembers;
        if (!query) return members;
        return members.filter(u => u.name.toLowerCase().includes(query));
    }

    // --- Active Channel Getter ---
    get activeChannel() {
        if (!this.props.activeChannelId) return null;
        return this.props.channels.find(c => c.id === this.props.activeChannelId);
    }

    // --- Filtered Channels Getter ---
    get filteredChannels() {
        const query = this.state.searchQuery.toLowerCase().trim();
        const list = this.props.channels.filter(c => c.channel_type !== "dm");
        if (!query) return list;
        return list.filter(c => c.name && c.name.toLowerCase().includes(query));
    }

    // --- Filtered DMs Getter ---
    get filteredDms() {
        const query = this.state.searchQuery.toLowerCase().trim();
        const list = this.props.channels.filter(c => c.channel_type === "dm");
        if (!query) return list;
        return list.filter(c => c.name && c.name.toLowerCase().includes(query));
    }

    // --- Modal: Create Channel ---
    openCreateChannelModal() {
        this.state.newChannelName = "";
        this.state.newChannelType = "public";
        this.state.selectedMembers = {};
        this.state.showCreateChannelModal = true;
    }

    closeCreateChannelModal() {
        this.state.showCreateChannelModal = false;
    }

    toggleMemberSelection(userId) {
        this.state.selectedMembers[userId] = !this.state.selectedMembers[userId];
    }

    async submitCreateChannel() {
        if (!this.state.newChannelName.trim()) {
            showToast(this.props.state, _t("Please enter a channel name."), "error");
            return;
        }

        const memberIds = [];
        if (this.state.newChannelType === "private") {
            Object.keys(this.state.selectedMembers).forEach(uid => {
                if (this.state.selectedMembers[uid]) {
                    memberIds.push(parseInt(uid));
                }
            });
            // Ensure creator user is included in members
            if (this.props.state.currentUserId && !memberIds.includes(this.props.state.currentUserId)) {
                memberIds.push(this.props.state.currentUserId);
            }
        }

        await this.props.onCreateInboxChannel(
            this.state.newChannelType,
            this.state.newChannelName.trim(),
            memberIds
        );
        this.closeCreateChannelModal();
    }

    // --- Modal: Start Direct Message ---
    openStartDmModal() {
        this.state.selectedDmUserId = "";
        
        // Find first user that is not current user to pre-select
        const otherUsers = this.props.users.filter(u => u.id !== this.props.state.currentUserId);
        if (otherUsers.length > 0) {
            this.state.selectedDmUserId = otherUsers[0].id.toString();
        } else if (this.props.users.length > 0) {
            this.state.selectedDmUserId = this.props.users[0].id.toString();
        }

        this.state.showStartDmModal = true;
    }

    closeStartDmModal() {
        this.state.showStartDmModal = false;
    }

    async submitStartDm() {
        if (!this.state.selectedDmUserId) {
            showToast(this.props.state, _t("Please select a user."), "error");
            return;
        }

        const memberIds = [parseInt(this.state.selectedDmUserId)];
        if (this.props.state.currentUserId && !memberIds.includes(this.props.state.currentUserId)) {
            memberIds.push(this.props.state.currentUserId);
        }

        await this.props.onCreateInboxChannel("dm", null, memberIds);
        this.closeStartDmModal();
    }

    // --- Select Channel ---
    selectChannel(channelId) {
        this.props.onSelectInboxChannel(channelId);
    }

    leaveChannel() {
        if (!this.activeChannel) return;
        const channelId = this.activeChannel.id;
        this.dialog.add(ConfirmationDialog, {
            title: _t("Leave Conversation"),
            body: _t("Are you sure you want to leave this conversation?"),
            confirmLabel: _t("Leave"),
            confirmClass: "btn-danger",
            confirm: () => this.props.onLeaveInboxChannel(channelId),
            cancel: () => {},
        });
    }

    deleteChannel() {
        if (!this.activeChannel) return;
        const channelId = this.activeChannel.id;
        this.dialog.add(ConfirmationDialog, {
            title: _t("Delete Channel"),
            body: _t("Are you sure you want to delete this channel? This will permanently delete the channel and all of its messages."),
            confirmLabel: _t("Delete"),
            confirmClass: "btn-danger",
            confirm: () => this.props.onDeleteInboxChannel(channelId),
            cancel: () => {},
        });
    }
}
