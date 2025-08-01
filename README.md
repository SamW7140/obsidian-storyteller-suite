# Storyteller Suite

A comprehensive suite for managing storytelling elements including characters, locations, events, and more.

## Features

- **Character Management**: Create and manage detailed character profiles with descriptions, backstories, relationships, and custom fields

- **Location Tracking**: Organize story locations with descriptions, history, and custom metadata

- **Event Timeline**: Track story events with dates, outcomes, and character involvement

- **Gallery System**: Manage story-related images with metadata and linking

- **Group Organization**: Create custom groups to organize characters, locations, and events

- **Multi-Story Support**: Manage multiple stories with isolated data folders

- **Dashboard Interface**: Unified view for all storytelling elements

## How to Use

1. Download the latest release
2. Extract the files to your Obsidian plugins folder
3. Enable the plugin in Obsidian settings
4. Access via the ribbon icon or command palette

### What You Can Do

- **Create, edit, and delete groups** from the Dashboard's Groups tab.
- **Edit group details** (name, description, color) in a dedicated modal.
- **Assign or remove members** (characters, events, locations) to/from groups using dropdown selectors.
- **See group membership** in the group modal and in each entity's modal.
- **Assign groups to characters, events, and locations** from their respective modals.
- **Real-time sync**: If groups are changed elsewhere, open modals will update their group selectors automatically.
- **Error handling**: Duplicate group names are prevented, and user feedback is provided for all group operations.

![Screenshot 1](https://raw.githubusercontent.com/SamW7140/obsidian-storyteller-suite/master/screenshots/Screenshot1.png)
![Screenshot 2](https://raw.githubusercontent.com/SamW7140/obsidian-storyteller-suite/master/screenshots/Screenshot2.png)
![Screenshot 3](https://raw.githubusercontent.com/SamW7140/obsidian-storyteller-suite/master/screenshots/Screenshot3.png)

## Data Structure

All data is stored as markdown files with YAML frontmatter:

- Characters: `StorytellerSuite/Stories/[StoryName]/Characters/`

- Locations: `StorytellerSuite/Stories/[StoryName]/Locations/`

- Events: `StorytellerSuite/Stories/[StoryName]/Events/`

- Images: User-defined upload folder


## Funding / Support

If you find this plugin helpful, consider supporting its development!

"Buy Me a Coffee": "https://ko-fi.com/kingmaws",

