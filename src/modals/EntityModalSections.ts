/**
 * Which parts of an entity's edit modal the user can switch off.
 *
 * The modals are opinionated by design — a D&D campaign and a low-fantasy prose
 * project want very different fields from the same Character. Hiding a section
 * only stops it being drawn; nothing already stored is touched, so turning a
 * section back on brings its values back with it.
 *
 * Only optional sections appear here. A name field has no toggle because an
 * entity without one cannot be saved.
 */

import type { EntityType } from '../yaml/EntitySections';

export interface ModalSectionDefinition {
    /** Stable id persisted in settings. Never rename one in place. */
    id: string;
    /** Shown next to the toggle in settings. */
    label: string;
}

export const ENTITY_MODAL_SECTIONS: Partial<Record<EntityType, ModalSectionDefinition[]>> = {
    character: [
        { id: 'profileImage', label: 'Profile image' },
        { id: 'description', label: 'Description' },
        { id: 'traits', label: 'Traits' },
        { id: 'backstory', label: 'Backstory' },
        { id: 'status', label: 'Status' },
        { id: 'affiliation', label: 'Affiliation' },
        { id: 'physicalAttributes', label: 'Physical attributes (gender, race, age, height)' },
        { id: 'quirks', label: 'Quirks and mannerisms' },
        { id: 'location', label: 'Location' },
        { id: 'cultures', label: 'Cultures' },
        { id: 'finances', label: 'Finances' },
        { id: 'inventory', label: 'Inventory' },
        { id: 'economies', label: 'Economies' },
        { id: 'groups', label: 'Groups' },
        { id: 'connections', label: 'Connections' },
        { id: 'dndStats', label: 'D&D stats' },
        { id: 'customFields', label: 'Custom fields' },
    ],
    item: [
        { id: 'profileImage', label: 'Item image' },
        { id: 'description', label: 'Description' },
        { id: 'history', label: 'History' },
        { id: 'whereToFind', label: 'Where to find' },
        { id: 'owners', label: 'Current owners' },
        { id: 'creator', label: 'Creator' },
        { id: 'quantity', label: 'Quantity' },
        { id: 'location', label: 'Current location' },
        { id: 'pastOwners', label: 'Past owners' },
        { id: 'associatedEvents', label: 'Associated events' },
        { id: 'associatedCharacters', label: 'Associated characters' },
        { id: 'groups', label: 'Groups' },
        { id: 'campaignUse', label: 'Campaign use' },
        { id: 'customFields', label: 'Custom fields' },
    ],
};

/** Sections the user can toggle for this entity type. Empty when unsupported. */
export function getModalSections(entityType: EntityType): ModalSectionDefinition[] {
    return ENTITY_MODAL_SECTIONS[entityType] ?? [];
}

/** True when the entity type has any toggleable sections at all. */
export function supportsSectionToggles(entityType: EntityType): boolean {
    return getModalSections(entityType).length > 0;
}

export type HiddenSectionMap = Record<string, string[] | undefined>;

/**
 * Whether a section should be skipped when drawing the modal.
 *
 * Unknown ids read as visible. A section that is not in the registry has no
 * toggle in settings, so it must never be hidden by a stale entry — otherwise
 * a renamed id would silently remove a field with no way to bring it back.
 */
export function isModalSectionHidden(
    hidden: HiddenSectionMap | undefined,
    entityType: EntityType,
    sectionId: string
): boolean {
    if (!hidden) return false;
    const known = getModalSections(entityType).some(section => section.id === sectionId);
    if (!known) return false;
    return (hidden[entityType] ?? []).includes(sectionId);
}

/** Toggle one section, returning the updated map. Does not mutate the input. */
export function setModalSectionHidden(
    hidden: HiddenSectionMap | undefined,
    entityType: EntityType,
    sectionId: string,
    isHidden: boolean
): HiddenSectionMap {
    const next: HiddenSectionMap = { ...(hidden ?? {}) };
    const current = new Set(next[entityType] ?? []);
    if (isHidden) current.add(sectionId);
    else current.delete(sectionId);
    const list = Array.from(current);
    if (list.length > 0) next[entityType] = list;
    else delete next[entityType];
    return next;
}

/**
 * Field names pre-populated on a newly created entity, so a recurring custom
 * field does not have to be typed for every character.
 *
 * Returns the existing fields untouched for anything but a new entity — seeding
 * an entity that already has values could resurrect a field the user deleted.
 */
export function seedDefaultCustomFields(
    existing: Record<string, string> | undefined,
    defaults: string[] | undefined
): Record<string, string> {
    const fields: Record<string, string> = { ...(existing ?? {}) };
    for (const rawName of defaults ?? []) {
        const name = rawName.trim();
        if (!name) continue;
        if (name in fields) continue;
        fields[name] = '';
    }
    return fields;
}
