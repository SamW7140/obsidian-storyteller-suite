import { describe, it, expect } from 'vitest';
import {
    getModalSections,
    supportsSectionToggles,
    isModalSectionHidden,
    setModalSectionHidden,
    seedDefaultCustomFields,
    ENTITY_MODAL_SECTIONS,
} from '../../src/modals/EntityModalSections';

describe('the section registry', () => {
    it('lists sections for the supported entity types', () => {
        expect(supportsSectionToggles('character')).toBe(true);
        expect(supportsSectionToggles('item')).toBe(true);
    });

    it('reports no sections for an unsupported type', () => {
        expect(getModalSections('event')).toEqual([]);
        expect(supportsSectionToggles('event')).toBe(false);
    });

    it('uses unique ids within each entity type', () => {
        for (const [entityType, sections] of Object.entries(ENTITY_MODAL_SECTIONS)) {
            const ids = (sections ?? []).map(s => s.id);
            expect(new Set(ids).size, `duplicate section id in ${entityType}`).toBe(ids.length);
        }
    });

    it('gives every section a label', () => {
        for (const sections of Object.values(ENTITY_MODAL_SECTIONS)) {
            for (const section of sections ?? []) {
                expect(section.label.trim().length).toBeGreaterThan(0);
            }
        }
    });
});

describe('isModalSectionHidden', () => {
    it('treats everything as visible with no settings', () => {
        expect(isModalSectionHidden(undefined, 'character', 'cultures')).toBe(false);
        expect(isModalSectionHidden({}, 'character', 'cultures')).toBe(false);
    });

    it('hides a section listed for that entity type', () => {
        expect(isModalSectionHidden({ character: ['cultures'] }, 'character', 'cultures')).toBe(true);
    });

    it('does not leak a hidden id across entity types', () => {
        expect(isModalSectionHidden({ character: ['groups'] }, 'item', 'groups')).toBe(false);
    });

    it('ignores an id the registry does not know', () => {
        // A stale entry from a renamed section must not silently remove a field
        // the settings screen no longer offers a toggle for.
        expect(isModalSectionHidden({ character: ['retiredSection'] }, 'character', 'retiredSection')).toBe(false);
    });
});

describe('setModalSectionHidden', () => {
    it('adds an id when hiding', () => {
        expect(setModalSectionHidden({}, 'character', 'cultures', true)).toEqual({ character: ['cultures'] });
    });

    it('removes an id when showing', () => {
        expect(setModalSectionHidden({ character: ['cultures'] }, 'character', 'cultures', false)).toEqual({});
    });

    it('drops the entity key once nothing is hidden for it', () => {
        const next = setModalSectionHidden({ character: ['cultures'], item: ['groups'] }, 'character', 'cultures', false);
        expect(next).toEqual({ item: ['groups'] });
        expect('character' in next).toBe(false);
    });

    it('does not duplicate an already-hidden id', () => {
        const next = setModalSectionHidden({ character: ['cultures'] }, 'character', 'cultures', true);
        expect(next.character).toEqual(['cultures']);
    });

    it('does not mutate the input', () => {
        const original = { character: ['cultures'] };
        setModalSectionHidden(original, 'character', 'groups', true);
        expect(original).toEqual({ character: ['cultures'] });
    });

    it('round-trips through isModalSectionHidden', () => {
        let map = setModalSectionHidden(undefined, 'character', 'dndStats', true);
        expect(isModalSectionHidden(map, 'character', 'dndStats')).toBe(true);
        map = setModalSectionHidden(map, 'character', 'dndStats', false);
        expect(isModalSectionHidden(map, 'character', 'dndStats')).toBe(false);
    });
});

describe('seedDefaultCustomFields', () => {
    it('adds each configured field with an empty value', () => {
        expect(seedDefaultCustomFields({}, ['intent', 'parents'])).toEqual({ intent: '', parents: '' });
    });

    it('never overwrites a value that is already there', () => {
        expect(seedDefaultCustomFields({ intent: 'revenge' }, ['intent'])).toEqual({ intent: 'revenge' });
    });

    it('keeps fields that are not in the defaults', () => {
        expect(seedDefaultCustomFields({ mood: 'grim' }, ['intent'])).toEqual({ mood: 'grim', intent: '' });
    });

    it('ignores blank entries', () => {
        expect(seedDefaultCustomFields({}, ['', '   ', 'intent'])).toEqual({ intent: '' });
    });

    it('trims names', () => {
        expect(seedDefaultCustomFields({}, ['  intent  '])).toEqual({ intent: '' });
    });

    it('returns a copy rather than the original object', () => {
        const existing = { mood: 'grim' };
        const result = seedDefaultCustomFields(existing, ['intent']);
        expect(result).not.toBe(existing);
        expect(existing).toEqual({ mood: 'grim' });
    });

    it('handles both arguments being absent', () => {
        expect(seedDefaultCustomFields(undefined, undefined)).toEqual({});
    });
});
