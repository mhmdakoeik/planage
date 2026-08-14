# -*- coding: utf-8 -*-
from odoo.tests.common import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestPlanageAccessRules(TransactionCase):
    """Space membership must be a real ORM-level security boundary, not just
    a UI filter: users outside a private Space's user_ids may not see or
    write its projects/tasks/chat/documents, while members and managers can.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        group_user = cls.env.ref("planage.group_planage_user")
        group_manager = cls.env.ref("planage.group_planage_manager")

        cls.member = cls.env["res.users"].create({
            "name": "Space Member",
            "login": "planage_member",
            "email": "planage_member@example.com",
            "group_ids": [(6, 0, [group_user.id])],
        })
        cls.outsider = cls.env["res.users"].create({
            "name": "Space Outsider",
            "login": "planage_outsider",
            "email": "planage_outsider@example.com",
            "group_ids": [(6, 0, [group_user.id])],
        })
        cls.manager = cls.env["res.users"].create({
            "name": "Space Manager",
            "login": "planage_manager",
            "email": "planage_manager@example.com",
            "group_ids": [(6, 0, [group_manager.id])],
        })

        cls.private_space = cls.env["planage.space"].create({
            "name": "Private Space",
            "user_ids": [(6, 0, [cls.member.id])],
        })
        cls.public_space = cls.env["planage.space"].create({
            "name": "Public Space",
        })

        cls.private_project = cls.env["planage.project"].create({
            "name": "Private Project",
            "space_id": cls.private_space.id,
        })
        cls.public_project = cls.env["planage.project"].create({
            "name": "Public Project",
            "space_id": cls.public_space.id,
        })

        cls.private_task = cls.env["planage.task"].create({
            "name": "Private Task",
            "project_id": cls.private_project.id,
        })
        cls.public_task = cls.env["planage.task"].create({
            "name": "Public Task",
            "project_id": cls.public_project.id,
        })

    def test_outsider_cannot_see_private_task(self):
        tasks = self.env["planage.task"].with_user(self.outsider).search([])
        self.assertNotIn(self.private_task.id, tasks.ids)
        self.assertIn(self.public_task.id, tasks.ids)

    def test_member_can_see_own_private_task(self):
        tasks = self.env["planage.task"].with_user(self.member).search([])
        self.assertIn(self.private_task.id, tasks.ids)
        self.assertIn(self.public_task.id, tasks.ids)

    def test_outsider_cannot_write_private_task(self):
        from odoo.exceptions import AccessError
        with self.assertRaises(AccessError):
            self.private_task.with_user(self.outsider).write({"name": "Hacked"})

    def test_manager_sees_everything(self):
        tasks = self.env["planage.task"].with_user(self.manager).search([])
        self.assertIn(self.private_task.id, tasks.ids)
        self.assertIn(self.public_task.id, tasks.ids)

    def test_outsider_cannot_see_private_project_or_chat(self):
        projects = self.env["planage.project"].with_user(self.outsider).search([])
        self.assertNotIn(self.private_project.id, projects.ids)

        chat_msg = self.env["planage.chat.message"].create({
            "project_id": self.private_project.id,
            "body": "secret",
        })
        chats = self.env["planage.chat.message"].with_user(self.outsider).search([])
        self.assertNotIn(chat_msg.id, chats.ids)
