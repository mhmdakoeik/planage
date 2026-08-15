import { BoardView } from "@planage/js/views/board_view";
import { describe, expect, test } from "@odoo/hoot";
import { click } from "@odoo/hoot-dom";
import { mountWithCleanup } from "@web/../tests/web_test_helpers";

describe("BoardView pagination", () => {
    const stages = [{ id: 1, name: "To Do", color: "#3b82f6" }];

    function makeTasks(count) {
        const tasks = [];
        for (let i = 0; i < count; i++) {
            tasks.push({
                id: i + 1,
                name: `Task ${i + 1}`,
                stage_id: 1,
                project_name: "Project",
                space_name: "Space",
                assignees: [],
                priority: "0",
            });
        }
        return tasks;
    }

    const noop = () => {};

    test("renders at most 30 cards per column and offers to show more", async () => {
        await mountWithCleanup(BoardView, {
            props: {
                stages,
                tasks: makeTasks(35),
                onWriteTask: noop,
                onOpenTask: noop,
                onCreateTask: noop,
            },
        });

        expect(".kanban-card").toHaveCount(30);
        expect(".board-show-more-btn").toHaveCount(1);
        expect(".board-show-more-btn").toHaveText("Show 5 more");
    });

    test("clicking 'show more' reveals the remaining cards", async () => {
        await mountWithCleanup(BoardView, {
            props: {
                stages,
                tasks: makeTasks(35),
                onWriteTask: noop,
                onOpenTask: noop,
                onCreateTask: noop,
            },
        });

        await click(".board-show-more-btn");
        expect(".kanban-card").toHaveCount(35);
        expect(".board-show-more-btn").toHaveCount(0);
    });

    test("does not show the button when everything already fits", async () => {
        await mountWithCleanup(BoardView, {
            props: {
                stages,
                tasks: makeTasks(5),
                onWriteTask: noop,
                onOpenTask: noop,
                onCreateTask: noop,
            },
        });

        expect(".kanban-card").toHaveCount(5);
        expect(".board-show-more-btn").toHaveCount(0);
    });
});
