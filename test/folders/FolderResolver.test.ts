import { describe, it, expect } from 'vitest';
import { FolderResolver } from '../../src/folders/FolderResolver';

describe('FolderResolver', () => {
  const story = { id: 's1', name: 'My Story' };

  it('default multi-story paths', () => {
    const r = new FolderResolver({ enableCustomEntityFolders: false, enableOneStoryMode: false }, () => story);
    expect(r.getEntityFolder('character')).toBe('StorytellerSuite/Stories/My Story/Characters');
    expect(r.getEntityFolder('event')).toBe('StorytellerSuite/Stories/My Story/Events');
  });

  it('one-story mode', () => {
    const r = new FolderResolver({ enableCustomEntityFolders: false, enableOneStoryMode: true, oneStoryBaseFolder: 'Base' }, () => story);
    expect(r.getEntityFolder('character')).toBe('Base/Characters');
    expect(r.getEntityFolder('reference')).toBe('Base/References');
  });

  it('custom folders with placeholders', () => {
    const r = new FolderResolver({
      enableCustomEntityFolders: true,
      storyRootFolderTemplate: 'Root/{storySlug}',
      characterFolderPath: 'Root/{storySlug}/Chars',
    }, () => story);
    expect(r.getEntityFolder('character')).toBe('Root/My_Story/Chars');
    // falls back to root + default leaf
    expect(r.getEntityFolder('location')).toBe('Root/My_Story/Locations');
  });

  // World-building entity folder tests
  describe('world-building entity folders', () => {
    it('default multi-story paths for world-building entities', () => {
      const r = new FolderResolver({ enableCustomEntityFolders: false, enableOneStoryMode: false }, () => story);
      expect(r.getEntityFolder('culture')).toBe('StorytellerSuite/Stories/My Story/Cultures');
      expect(r.getEntityFolder('economy')).toBe('StorytellerSuite/Stories/My Story/Economies');
      expect(r.getEntityFolder('faction')).toBe('StorytellerSuite/Stories/My Story/Factions');
      expect(r.getEntityFolder('magicSystem')).toBe('StorytellerSuite/Stories/My Story/MagicSystems');
    });

    it('one-story mode for world-building entities', () => {
      const r = new FolderResolver({ enableCustomEntityFolders: false, enableOneStoryMode: true, oneStoryBaseFolder: 'Base' }, () => story);
      expect(r.getEntityFolder('culture')).toBe('Base/Cultures');
      expect(r.getEntityFolder('economy')).toBe('Base/Economies');
      expect(r.getEntityFolder('faction')).toBe('Base/Factions');
      expect(r.getEntityFolder('magicSystem')).toBe('Base/MagicSystems');
    });

    it('custom folders with placeholders for world-building entities', () => {
      const r = new FolderResolver({
        enableCustomEntityFolders: true,
        storyRootFolderTemplate: 'Root/{storySlug}',
        cultureFolderPath: 'Root/{storySlug}/MyCultures',
        economyFolderPath: 'Root/{storySlug}/MyEconomies',
        factionFolderPath: 'Root/{storySlug}/MyFactions',
        magicSystemFolderPath: 'Root/{storySlug}/MyMagic',
      }, () => story);
      expect(r.getEntityFolder('culture')).toBe('Root/My_Story/MyCultures');
      expect(r.getEntityFolder('economy')).toBe('Root/My_Story/MyEconomies');
      expect(r.getEntityFolder('faction')).toBe('Root/My_Story/MyFactions');
      expect(r.getEntityFolder('magicSystem')).toBe('Root/My_Story/MyMagic');
    });

    it('world-building entities fallback to root + default leaf when custom path not set', () => {
      const r = new FolderResolver({
        enableCustomEntityFolders: true,
        storyRootFolderTemplate: 'Root/{storySlug}',
        // no specific paths set for world-building entities
      }, () => story);
      expect(r.getEntityFolder('culture')).toBe('Root/My_Story/Cultures');
      expect(r.getEntityFolder('economy')).toBe('Root/My_Story/Economies');
      expect(r.getEntityFolder('faction')).toBe('Root/My_Story/Factions');
      expect(r.getEntityFolder('magicSystem')).toBe('Root/My_Story/MagicSystems');
    });
  });

  describe('per-story folder overrides', () => {
    const globals = {
      enableCustomEntityFolders: true,
      storyRootFolderTemplate: 'Shared/{storySlug}',
      characterFolderPath: 'Shared/{storySlug}/Cast',
    };

    it('a story with no overrides resolves exactly as before', () => {
      const r = new FolderResolver(globals, () => ({ id: 's1', name: 'My Story' }));
      expect(r.getEntityFolder('character')).toBe('Shared/My_Story/Cast');
      expect(r.getEntityFolder('location')).toBe('Shared/My_Story/Locations');
    });

    it('an override replaces the global path for that entity only', () => {
      const r = new FolderResolver(globals, () => ({
        id: 's2', name: 'Other Story',
        folderOverrides: { characterFolderPath: 'Elsewhere/People' },
      }));
      expect(r.getEntityFolder('character')).toBe('Elsewhere/People');
      // untouched entity still follows the global root
      expect(r.getEntityFolder('location')).toBe('Shared/Other_Story/Locations');
    });

    it('a blank override inherits the global value, it does not reset to the default leaf', () => {
      const r = new FolderResolver(globals, () => ({
        id: 's3', name: 'My Story',
        folderOverrides: { characterFolderPath: '   ' },
      }));
      expect(r.getEntityFolder('character')).toBe('Shared/My_Story/Cast');
    });

    it('overriding the root template moves every inherited subfolder with it', () => {
      const r = new FolderResolver(globals, () => ({
        id: 's4', name: 'Second Book',
        folderOverrides: { storyRootFolderTemplate: 'Books/{storyName}' },
      }));
      expect(r.getEntityFolder('location')).toBe('Books/Second Book/Locations');
      expect(r.getStoryRootFolder()).toBe('Books/Second Book');
    });

    it('overrides support the same placeholders as the global settings', () => {
      const r = new FolderResolver(globals, () => ({
        id: 's5', name: 'My Story',
        folderOverrides: { eventFolderPath: 'Archive/{storyId}/Events' },
      }));
      expect(r.getEntityFolder('event')).toBe('Archive/s5/Events');
    });

    it('two stories resolve to different folders from the same settings', () => {
      let active = { id: 'a', name: 'Alpha' } as { id: string; name: string; folderOverrides?: Record<string, string> };
      const r = new FolderResolver(globals, () => active);
      expect(r.getEntityFolder('character')).toBe('Shared/Alpha/Cast');
      active = { id: 'b', name: 'Beta', folderOverrides: { characterFolderPath: 'Beta/Folk' } };
      expect(r.getEntityFolder('character')).toBe('Beta/Folk');
    });

    it('usesBookName honours a story override', () => {
      const r = new FolderResolver(globals, () => ({
        id: 's6', name: 'My Story',
        folderOverrides: { chapterFolderPath: 'Shared/{storySlug}/{bookName}/Chapters' },
      }));
      expect(r.usesBookName('chapter')).toBe(true);
      expect(r.usesBookName('character')).toBe(false);
    });

    it('compendium entries honour a configured folder path', () => {
      const r = new FolderResolver({
        enableCustomEntityFolders: true,
        storyRootFolderTemplate: 'Root/{storySlug}',
        compendiumFolderPath: 'Root/{storySlug}/Lore',
      }, () => story);
      expect(r.getEntityFolder('compendiumEntry')).toBe('Root/My_Story/Lore');
    });
  });
});
