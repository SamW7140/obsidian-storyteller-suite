import { describe, it, expect } from 'vitest';
import {
    isModalFieldVisible,
    CHARACTER_MODAL_FIELDS,
    MODAL_FIELD_SETS,
} from '../../src/modals/entity/ModalFieldVisibility';

describe('isModalFieldVisible', () => {
    it('shows everything when nothing is configured', () => {
        expect(isModalFieldVisible(undefined, 'character', 'quirks')).toBe(true);
        expect(isModalFieldVisible({}, 'character', 'quirks')).toBe(true);
    });

    it('hides only the listed field', () => {
        const hidden = { character: ['quirks'] };
        expect(isModalFieldVisible(hidden, 'character', 'quirks')).toBe(false);
        expect(isModalFieldVisible(hidden, 'character', 'description')).toBe(true);
    });

    it('does not leak a hidden field across entity types', () => {
        const hidden = { character: ['description'] };
        expect(isModalFieldVisible(hidden, 'location', 'description')).toBe(true);
    });

    it('an empty hidden list shows everything', () => {
        expect(isModalFieldVisible({ character: [] }, 'character', 'quirks')).toBe(true);
    });

    it('falls back to visible when the stored value is malformed', () => {
        // A settings file edited by hand, or written by an older version, must
        // never blank out the modal.
        const malformed = { character: 'quirks' } as unknown as Record<string, string[]>;
        expect(isModalFieldVisible(malformed, 'character', 'quirks')).toBe(true);
    });
});

describe('field definitions', () => {
    it('name is not hideable, since saving requires it', () => {
        expect(CHARACTER_MODAL_FIELDS.some(f => f.key === 'name')).toBe(false);
    });

    it('keys are unique', () => {
        for (const fields of Object.values(MODAL_FIELD_SETS)) {
            const keys = fields.map(f => f.key);
            expect(new Set(keys).size).toBe(keys.length);
        }
    });

    it('every field has a label', () => {
        for (const fields of Object.values(MODAL_FIELD_SETS)) {
            for (const field of fields) {
                expect(field.label.trim().length).toBeGreaterThan(0);
            }
        }
    });
});
