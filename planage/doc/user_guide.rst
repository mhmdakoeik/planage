==========
User Guide
==========

Planage is an all-in-one workspace productivity suite built natively inside Odoo 19
with OWL. It runs as a single-page app inside Odoo — no extra install, no page
reloads — and brings together project management, sprints, a kanban board,
calendar, Gantt timeline, team chat, a global inbox, document storage, reporting,
and project billing in one place.

This guide covers everything a day-to-day user, project manager, or administrator
needs to work in Planage.

Getting Started
================

Open Planage from the Odoo **Apps** menu (top-left app switcher) — look for the
checkmark icon. The app opens as a single workspace with a persistent left
sidebar and a main content canvas on the right.

Your access level depends on your assigned role (see `Roles & Permissions`_ below).

Core Concepts
=============

Planage organizes work in a simple hierarchy::

    Workspace
     -> Space            (a department or high-level area, e.g. "Product Delivery")
         -> Project      (a deliverable or initiative, e.g. "Website Relaunch")
             -> Folder   (optional -- groups sprints inside a project)
             -> Sprint   (a time-boxed block of work, e.g. "Sprint 4")
                 -> Task (the actual work item -- supports subtasks)

- **Space** -- the top-level container. Has a name, color, icon, and a list of
  assigned members.
- **Project** -- lives inside a Space. Every new project is automatically given
  four default stages: To Do, In Progress, Review, Done. Projects can optionally
  be marked billable (see `Project Billing`_).
- **Folder** -- an optional layer inside a project used to group related sprints.
- **Sprint** -- a dated window of work (start date -> end date) that contains
  tasks. Selecting a sprint reveals the Tasks / Board / Calendar / Gantt / Chat
  tabs for that sprint.
- **Task** -- the unit of work. Tasks have a title, rich-text description, stage,
  priority, assignees, responsible user, start/end dates, progress percentage,
  subtasks, timesheets, and attached documents.

Roles & Permissions
====================

Planage ships with three roles (Odoo user groups):

.. list-table::
   :header-rows: 1

   * - Role
     - Can do
   * - Employee (User)
     - View projects and spaces they're a member of; work on tasks (create/edit
       tasks, log time, chat).
   * - Manager
     - Everything an Employee can, plus create and manage Spaces, Projects,
       Sprints, and Stages.
   * - Administrator
     - Full access -- all of the above, plus Configuration settings, Reporting,
       Project Billing, and the System Reset danger zone.

Access to individual Spaces and Projects is further scoped by membership -- see
**Space Access & Member Settings** and **Project Member Settings** under
Configuration.

The Sidebar
===========

The left sidebar is always visible (collapsible via the arrow icon) and contains:

- **Dashboard** -- your workspace overview.
- **My Tasks** -- every task assigned to you, across all projects.
- **Notifications** -- a live feed of assignments, mentions, and milestones,
  with an unread badge.
- **Docs** -- a searchable hub of every document/attachment across the workspace.
- **Inbox** -- global chat channels and direct messages, separate from
  per-sprint chat.
- **Reporting** -- analytics and exportable reports (Manager/Administrator only).
- **Configuration** -- settings and workflow customization (Administrator only).
- **Spaces list** -- expandable tree of every Space -> Project -> Sprint you
  have access to. Click **Everything** to see a cross-space view.

Dashboard
=========

The Dashboard is your landing page. It shows, for the selected scope (all
projects or one project):

- **Total Tasks**, **To Do**, **Done**, and **Uploaded Docs** counters.
- **Task Status** -- a donut chart breaking down completion.
- **Priority Distribution** -- a bar breakdown of Urgent / High / Normal / Low
  tasks.
- A live **completion rate** badge in the header.

Use the **All Projects** filter at the top to scope the dashboard to a single
project.

Working with Tasks
===================

Once you open a Sprint, five tabs become available: Tasks, Board, Calendar,
Gantt, Chat.

Tasks (list view)
------------------

A spreadsheet-style list of every task in the sprint, with inline editing of
stage, priority, assignee, and dates.

Board (kanban)
--------------

Tasks grouped into columns by stage (To Do / In Progress / Review / Done by
default). Drag a card between columns to change its stage. Each card shows the
assignee, due date, and priority flag. Use **+ Add task** at the bottom of a
column to create a task directly in that stage.

Calendar
--------

Tasks placed on the calendar by due date. Useful for spotting workload
clustering across a month.

Gantt
-----

A timeline view of every task in the sprint plotted against its start/end
dates, with the sprint's own date range shown as a header bar and a "Today"
marker.

Task details
------------

Every task supports:

- **Subtasks** -- break a task into smaller child tasks.
- **Priority** -- Low / Medium / High / Urgent.
- **Assignees** -- multiple people can be assigned; a Responsible user is
  tracked separately.
- **Timesheets** -- log hours worked against a task (date, description,
  duration). Logged hours roll up into Total Hours, which feeds project
  billing.
- **Documents** -- attach files directly to a task.
- **Activity tracking** -- task history (stage changes, assignment changes,
  etc.) is tracked automatically.

Team Chat
=========

Each sprint has its own Chat tab -- a running discussion thread scoped to that
sprint's team. Type ``@Name`` to mention a teammate; mentioned users get a
notification. Messages can carry an attachment, which is automatically indexed
into the Docs hub.

Global Inbox
============

Separate from per-sprint chat, the Inbox (sidebar) hosts workspace-wide
conversations:

- **Public channels** -- visible to everyone.
- **Private channels** -- visible only to invited members.
- **Direct messages** -- one-to-one conversations.

Mentioning someone with ``@Name`` in any inbox channel sends them a
notification, same as sprint chat.

Project Billing
================

Projects can be marked billable from **Configuration -> Project Billing
Settings**:

1. Select the **Client** (a contact/partner).
2. Set an **Hourly Rate**.
3. Save.

Once billable, open the project and use **Create Invoice**. Planage totals each
task's logged hours (from timesheets) and generates a draft customer invoice
(``account.move``) with one line per task, priced at the project's hourly rate.
Invoicing requires: the project marked billable, a client set, and at least one
task with logged hours -- otherwise you'll get a clear validation message
telling you what's missing.

Generated invoices are linked back to the project and visible from there.

One invoice at a time per project
----------------------------------

A project can have only one *unposted* (draft) invoice at a time:

- While a draft invoice exists, **Create Invoice** is replaced by
  **Update Invoice**. Use it to re-sync the invoice's lines with the latest
  logged hours as timesheets are added -- it does not create a second invoice.
- Once that invoice is **posted**, it becomes permanently locked: it can no
  longer be edited or reset to draft, even by an Administrator.
- After posting, **Create Invoice** reappears so a new invoice can be started
  for the next billing cycle, covering hours logged from that point on.

Reporting
=========

Available to Managers and Administrators. The Reporting page provides:

- Filterable views by week or month.
- Per-project totals (Total Tasks, completion breakdown, pipeline distribution).
- Export to PDF and Export to Excel (CSV) for sharing outside Odoo.

Documents Hub
=============

The Docs page is a searchable index of every file in the workspace -- whether
uploaded directly to a task or shared as a chat attachment -- with the source
task or chat conversation shown for context. Use the search box to filter by
file name.

Notifications
==============

The Notifications page (and sidebar bell icon with unread count) surfaces:

- **Assignment** -- you were assigned to a task, project, or space.
- **Mention** -- someone ``@mentioned`` you in sprint chat or the inbox.
- **Milestone** -- significant project events.
- **Inbox** -- new messages in inbox channels you belong to.

Mark individual notifications as read, or use Mark all read.

Configuration (Administrators)
================================

The Configuration page has five sections:

1. **Appearance Mode** -- switch the whole app between light and dark themes.
2. **Space Access & Member Settings** -- control who belongs to which Space.
3. **Project Member Settings** -- control who belongs to which Project.
4. **Project Billing Settings** -- set client and hourly rate per project (see
   `Project Billing`_).
5. **Stage Status Workflows** -- customize each project's pipeline: add,
   reorder, recolor, or mark a stage as a "closing" stage (counted as done in
   progress calculations).

System Reset (Danger Zone)
----------------------------

Administrators only, and **development environments only**. **Wipe All Data &
Reset Fresh** permanently deletes all Planage records (spaces, projects,
tasks, chats, documents) to start over with a clean slate. This cannot be
undone. The button (and the underlying action) is only available when Odoo is
running in developer mode (started with ``--dev``); it is automatically
hidden and blocked on production instances, so there is no risk of an
accidental production wipe.

Tips
====

- Use the **Everything** view in the sidebar to see tasks across every space
  you have access to, without picking a specific project first.
- Priority flags and stage colors are consistent across Board, Calendar, and
  Gantt, so you can visually track a task's state no matter which view you're
  in.
- Dark mode (Configuration -> Appearance Mode) applies instantly across every
  view.
- Chat and Inbox mentions both generate notifications -- if a teammate isn't
  seeing your ``@mention``, double check you typed their exact display name.
