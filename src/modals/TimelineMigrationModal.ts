import { App, Modal, Setting, DropdownComponent } from 'obsidian';
import StorytellerSuitePlugin from '../main';

/**
 * Asks which story should adopt timeline data that predates story scoping.
 *
 * Eras, tracks and branches used to be rows in the plugin's settings, shared by
 * every story in the vault. Becoming notes means being filed somewhere, and a
 * folder is a story, so anything still unlabelled needs an owner before it can
 * move. Rows that already name a story are left alone and go to that story.
 */
export class TimelineMigrationModal extends Modal {
    private plugin: StorytellerSuitePlugin;
    private onConfirm: (storyId: string) => void;
    private selectedStoryId: string;

    constructor(app: App, plugin: StorytellerSuitePlugin, onConfirm: (storyId: string) => void) {
        super(app);
        this.plugin = plugin;
        this.onConfirm = onConfirm;
        this.selectedStoryId = plugin.settings.activeStoryId || plugin.settings.stories[0]?.id || '';
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Move timeline data into notes' });

        const counts = {
            eras: this.plugin.settings.timelineEras?.length || 0,
            tracks: this.plugin.settings.timelineTracks?.length || 0,
            branches: this.plugin.settings.timelineForks?.length || 0
        };
        const unassigned = [
            ...(this.plugin.settings.timelineEras || []),
            ...(this.plugin.settings.timelineTracks || []),
            ...(this.plugin.settings.timelineForks || [])
        ].filter(entry => !entry.storyId).length;

        contentEl.createEl('p', {
            text: `Your ${counts.eras} eras, ${counts.tracks} tracks and ${counts.branches} branches become notes in the ` +
                'story folders, so you can link them, search them and share them with the rest of the story.'
        });

        if (unassigned > 0) {
            contentEl.createEl('p', {
                text: `${unassigned} of them predate story folders and do not say which story they belong to. ` +
                    'Pick the story that should adopt them. Everything that already names a story goes to that story instead.'
            });

            new Setting(contentEl)
                .setName('Adopt unassigned data into')
                .addDropdown((dropdown: DropdownComponent) => {
                    for (const story of this.plugin.settings.stories) dropdown.addOption(story.id, story.name);
                    dropdown.setValue(this.selectedStoryId);
                    dropdown.onChange((value: string) => { this.selectedStoryId = value; });
                });
        }

        contentEl.createEl('p', {
            cls: 'setting-item-description',
            text: 'The old data is kept as a backup, and "undo timeline notes migration" puts it back.'
        });

        new Setting(contentEl)
            .addButton(button => button.setButtonText('Cancel').onClick(() => this.close()))
            .addButton(button => button
                .setButtonText('Move into notes')
                .setCta()
                .onClick(() => {
                    this.close();
                    this.onConfirm(this.selectedStoryId);
                }));
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
