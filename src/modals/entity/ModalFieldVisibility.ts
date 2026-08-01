/**
 * Optional fields in the entity modals, and which of them a vault has chosen to
 * hide.
 *
 * Hiding is presentation only. A hidden field is not rendered, but the modal
 * submits the entity object it loaded, so any value already stored in a hidden
 * field is preserved untouched. Nothing here deletes data.
 */

/** An entity modal field that can be turned off. */
export interface ModalFieldDef {
    /** Stable key. Persisted in settings, so never rename one of these. */
    key: string;
    /** Shown in the settings list. */
    label: string;
    /** Optional grouping for the settings list. */
    group?: string;
}

/**
 * Character modal fields that may be hidden. Name is deliberately absent: it is
 * required to save, so it can never be turned off.
 */
export const CHARACTER_MODAL_FIELDS: ModalFieldDef[] = [
    { key: 'profileImage', label: 'Profile image', group: 'Basics' },
    { key: 'description', label: 'Description', group: 'Basics' },
    { key: 'traits', label: 'Traits', group: 'Basics' },
    { key: 'backstory', label: 'Backstory', group: 'Basics' },
    { key: 'status', label: 'Status', group: 'Basics' },
    { key: 'affiliation', label: 'Affiliation', group: 'Basics' },
    { key: 'physicalAttributes', label: 'Physical attributes (gender, race, age, height)', group: 'Detail' },
    { key: 'quirks', label: 'Quirks', group: 'Detail' },
    { key: 'location', label: 'Current location and location history', group: 'Detail' },
    { key: 'cultures', label: 'Cultures', group: 'World-building' },
    { key: 'inventory', label: 'Inventory and balance', group: 'World-building' },
    { key: 'economies', label: 'Economies', group: 'World-building' },
    { key: 'groups', label: 'Groups', group: 'World-building' },
    { key: 'connections', label: 'Connections', group: 'World-building' },
    { key: 'customFields', label: 'Custom fields', group: 'Advanced' },
    { key: 'dndStats', label: 'D&D stats', group: 'Advanced' },
];

/** Entity modals that support hiding fields. */
export const MODAL_FIELD_SETS: Record<string, ModalFieldDef[]> = {
    character: CHARACTER_MODAL_FIELDS,
};

/**
 * Whether a field should render.
 *
 * Defaults to visible: an unknown entity type, a missing settings key, or a
 * malformed stored value all mean "show it". A vault that has never configured
 * this sees exactly the modal it saw before.
 */
export function isModalFieldVisible(
    hidden: Record<string, string[]> | undefined,
    entityType: string,
    fieldKey: string
): boolean {
    const hiddenForType = hidden?.[entityType];
    if (!Array.isArray(hiddenForType)) return true;
    return !hiddenForType.includes(fieldKey);
}
