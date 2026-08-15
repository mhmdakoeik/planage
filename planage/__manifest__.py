# -*- coding: utf-8 -*-
{
    "name": "Planage — Workspace Productivity Suite",
    "version": "19.0.1.0.0",
    "summary": "Project management SPA built inside Odoo using OWL",
    "description": """
Planage is a high-performance, single-workspace productivity tool built on top of
Odoo 19 using OWL (Odoo Web Library) and Bootstrap 5. It replicates
core layout, enabling:

- Multi-view task handling (List, Board, Calendar, Gantt)
- Strategic Goal & KPI tracking
- Integrated Task Comments and Real-Time Activity Feed
- Hierarchical Workspace > Space > Folder > List > Task organization
- Zero-page-reload SPA experience with offline-safe sync resiliency
    """,
    "category": "Productivity",
    "author": "Mohammad A. Koeik",
    "license": "LGPL-3",
    "sequence": 5,
    'support': 'mkoeik.support@gmail.com',
    "icon": "/planage/static/description/icon.png",
    "depends": [
        "base",
        "mail",
        "web",
        "bus",
        "account",
    ],
    "data": [
        "security/security.xml",
        "security/ir.model.access.csv",
        "security/planage_record_rules.xml",
        "views/planage_action.xml",
        "views/planage_menu.xml",
        "views/planage_billing_views.xml",
    ],
    "assets": {
        "web.assets_backend": [
            # Core CSS
            "planage/static/src/css/planage.css",
            # Utilities
            "planage/static/src/js/utils/toast.js",
            "planage/static/src/js/utils/sprint.js",
            "planage/static/src/js/utils/theme.js",
            # OWL Components
            "planage/static/src/js/planage_app.js",
            "planage/static/src/js/components/sidebar.js",
            "planage/static/src/js/components/canvas.js",
            "planage/static/src/js/components/right_drawer.js",
            "planage/static/src/js/views/list_view.js",
            "planage/static/src/js/views/board_view.js",
            "planage/static/src/js/views/calendar_view.js",
            "planage/static/src/js/views/gantt_view.js",
            "planage/static/src/js/views/chat_view.js",
            "planage/static/src/js/views/docs_view.js",
            "planage/static/src/js/views/dashboard_view.js",
            "planage/static/src/js/views/notifications_view.js",
            "planage/static/src/js/views/config_view.js",
            "planage/static/src/js/views/inbox_view.js",
            "planage/static/src/js/views/reporting_view.js",
            "planage/static/src/js/systray/planage_systray.js",
            # OWL Templates
            "planage/static/src/xml/planage_app.xml",
            "planage/static/src/xml/sidebar.xml",
            "planage/static/src/xml/canvas.xml",
            "planage/static/src/xml/right_drawer.xml",
            "planage/static/src/xml/list_view.xml",
            "planage/static/src/xml/board_view.xml",
            "planage/static/src/xml/calendar_view.xml",
            "planage/static/src/xml/planage_systray.xml",
            "planage/static/src/xml/gantt_view.xml",
            "planage/static/src/xml/chat_view.xml",
            "planage/static/src/xml/docs_view.xml",
            "planage/static/src/xml/dashboard_view.xml",
            "planage/static/src/xml/notifications_view.xml",
            "planage/static/src/xml/config_view.xml",
            "planage/static/src/xml/inbox_view.xml",
            "planage/static/src/xml/reporting_view.xml",
        ],
        "web.assets_unit_tests": [
            "planage/static/tests/**/*.test.js",
        ],
    },
    "installable": True,
    "application": True,
    "auto_install": False,
}
