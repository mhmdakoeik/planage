import { findSprintById } from "@planage/js/utils/sprint";
import { describe, expect, test } from "@odoo/hoot";

describe("findSprintById", () => {
    const spaces = [
        {
            id: 1,
            projects: [
                {
                    id: 10,
                    sprints: [{ id: 100, name: "Direct Sprint" }],
                    folders: [
                        {
                            id: 20,
                            sprints: [{ id: 200, name: "Folder Sprint" }],
                        },
                    ],
                },
            ],
        },
    ];

    test("returns null when sprintId is falsy", () => {
        expect(findSprintById(spaces, null)).toBe(null);
        expect(findSprintById(spaces, undefined)).toBe(null);
        expect(findSprintById(spaces, 0)).toBe(null);
    });

    test("returns null when spaces is empty or missing", () => {
        expect(findSprintById([], 100)).toBe(null);
        expect(findSprintById(undefined, 100)).toBe(null);
    });

    test("finds a sprint attached directly to a project", () => {
        const sprint = findSprintById(spaces, 100);
        expect(sprint).not.toBe(null);
        expect(sprint.name).toBe("Direct Sprint");
    });

    test("finds a sprint nested inside a project's folder", () => {
        const sprint = findSprintById(spaces, 200);
        expect(sprint).not.toBe(null);
        expect(sprint.name).toBe("Folder Sprint");
    });

    test("returns null for an id that doesn't exist anywhere", () => {
        expect(findSprintById(spaces, 999)).toBe(null);
    });
});
