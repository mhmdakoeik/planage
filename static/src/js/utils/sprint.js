/** @odoo-module **/

/**
 * Finds a sprint by id anywhere in the Space > Project > (Folder >) Sprint
 * hierarchy returned by /planage/spaces. Shared so the lookup logic isn't
 * duplicated (and liable to drift) across every view that needs the
 * "currently active sprint".
 */
export function findSprintById(spaces, sprintId) {
    if (!sprintId) return null;
    for (const space of spaces || []) {
        for (const proj of space.projects || []) {
            for (const sprint of proj.sprints || []) {
                if (sprint.id === sprintId) return sprint;
            }
            for (const folder of proj.folders || []) {
                for (const sprint of folder.sprints || []) {
                    if (sprint.id === sprintId) return sprint;
                }
            }
        }
    }
    return null;
}
