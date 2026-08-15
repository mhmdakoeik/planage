import { GanttView } from "@planage/js/views/gantt_view";
import { describe, expect, test } from "@odoo/hoot";
import { click } from "@odoo/hoot-dom";
import { mountWithCleanup } from "@web/../tests/web_test_helpers";

describe("GanttView pagination", () => {
    function makeTasks(count) {
        const tasks = [];
        const today = new Date().toISOString().slice(0, 10);
        for (let i = 0; i < count; i++) {
            tasks.push({
                id: i + 1,
                name: `Task ${i + 1}`,
                date_start: today,
                date_end: today,
                priority: "0",
                assignees: [],
            });
        }
        return tasks;
    }

    function makeState() {
        return { spaces: [], activeSprintId: null };
    }

    test("renders at most 50 bars and offers to show more", async () => {
        await mountWithCleanup(GanttView, {
            props: { tasks: makeTasks(60), state: makeState() },
        });

        expect(".gantt-bar-pill").toHaveCount(50);
        expect(".gantt-show-more-btn").toHaveCount(1);
        expect(".gantt-show-more-btn").toHaveText("Show 10 more tasks");
    });

    test("clicking 'show more' reveals the remaining bars", async () => {
        await mountWithCleanup(GanttView, {
            props: { tasks: makeTasks(60), state: makeState() },
        });

        await click(".gantt-show-more-btn");
        expect(".gantt-bar-pill").toHaveCount(60);
        expect(".gantt-show-more-btn").toHaveCount(0);
    });

    test("does not show the button when everything already fits", async () => {
        await mountWithCleanup(GanttView, {
            props: { tasks: makeTasks(10), state: makeState() },
        });

        expect(".gantt-bar-pill").toHaveCount(10);
        expect(".gantt-show-more-btn").toHaveCount(0);
    });
});
