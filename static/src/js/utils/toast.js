/** @odoo-module **/

/**
 * Shared toast helper so any component holding a reference to the app's
 * top-level reactive `state` (passed down as `props.state`) can surface a
 * message, instead of only logging failures to the console.
 */
export function showToast(state, message, type = "info") {
    state.toastMessage = message;
    state.toastType = type;
    setTimeout(() => {
        state.toastMessage = null;
    }, 3500);
}
