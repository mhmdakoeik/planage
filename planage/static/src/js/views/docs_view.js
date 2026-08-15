/** @odoo-module **/

import { Component, useState } from "@odoo/owl";

export class DocsView extends Component {
    static template = "planage.DocsView";

    setup() {
        this.state = useState({
            searchQuery: "",
            dateFilter: "all", // all | today | week | month
            currentPage: 1,
            pageSize: 6,
        });
    }

    get filteredDocuments() {
        let docs = this.props.documents || [];

        // 1. Search Query Filter
        if (this.state.searchQuery.trim()) {
            const query = this.state.searchQuery.toLowerCase().trim();
            docs = docs.filter(d => d.name.toLowerCase().includes(query));
        }

        // 2. Date Filter
        if (this.state.dateFilter !== "all") {
            const now = new Date();
            docs = docs.filter(d => {
                if (!d.create_date) return false;
                
                try {
                    // Convert date string: "Nov 19, 2026 at 07:21 PM" -> "Nov 19, 2026 07:21 PM"
                    const docDate = new Date(d.create_date.replace(" at", ""));
                    if (isNaN(docDate.getTime())) return true;
                    
                    const diffTime = Math.abs(now - docDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    if (this.state.dateFilter === "today") {
                        return diffDays <= 1;
                    } else if (this.state.dateFilter === "week") {
                        return diffDays <= 7;
                    } else if (this.state.dateFilter === "month") {
                        return diffDays <= 30;
                    }
                } catch (e) {
                    return true;
                }
                return true;
            });
        }

        return docs;
    }

    get totalPages() {
        return Math.ceil(this.filteredDocuments.length / this.state.pageSize) || 1;
    }

    get paginatedDocuments() {
        // Adjust page if it exceeds total pages
        if (this.state.currentPage > this.totalPages) {
            this.state.currentPage = this.totalPages;
        }
        const start = (this.state.currentPage - 1) * this.state.pageSize;
        return this.filteredDocuments.slice(start, start + this.state.pageSize);
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

    setDateFilter(filter) {
        this.state.dateFilter = filter;
        this.state.currentPage = 1;
    }

    onSearchChange() {
        this.state.currentPage = 1;
    }
}
