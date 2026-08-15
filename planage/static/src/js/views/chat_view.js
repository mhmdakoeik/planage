/** @odoo-module **/

import { Component, useState } from "@odoo/owl";

export class ChatView extends Component {
    static template = "planage.ChatView";

    setup() {
        this.state = useState({
            newMessage: "",
            showMentionsDropdown: false,
            mentionSearchQuery: "",
            mentionCursorIndex: -1,
            mentionStartIndex: -1,
            mentionSelectedIndex: 0,
        });
    }

    get messages() {
        return this.props.messages || [];
    }

    get projectMembers() {
        if (!this.props.project || !this.props.project.user_ids || !this.props.users) {
            return [];
        }
        const memberIds = this.props.project.user_ids;
        const currentUserId = this.props.state.currentUserId;
        return this.props.users.filter(u => memberIds.includes(u.id) && u.id !== currentUserId);
    }

    get matchingMembers() {
        const query = this.state.mentionSearchQuery.toLowerCase();
        const members = this.projectMembers;
        if (!query) return members;
        return members.filter(u => u.name.toLowerCase().includes(query));
    }

    async postMessage() {
        if (!this.state.newMessage.trim()) return;
        
        await this.props.onPostChatMessage(this.state.newMessage, false);
        this.state.newMessage = "";
        this.state.showMentionsDropdown = false;
    }

    onInput(ev) {
        const textarea = ev.target;
        const val = textarea.value;
        const selStart = textarea.selectionStart;
        
        // Find if there is an '@' preceding the cursor in the current word
        const textBeforeCursor = val.substring(0, selStart);
        const lastAtIdx = textBeforeCursor.lastIndexOf("@");
        
        if (lastAtIdx !== -1) {
            // Check if there are spaces/newlines between the last '@' and the cursor
            const word = textBeforeCursor.substring(lastAtIdx + 1);
            if (!word.includes(" ") && !word.includes("\n")) {
                this.state.showMentionsDropdown = true;
                this.state.mentionSearchQuery = word;
                this.state.mentionStartIndex = lastAtIdx;
                this.state.mentionCursorIndex = selStart;
                
                // Adjust index if list shrunk
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
        const textarea = document.querySelector(".composer-textarea");
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
}
