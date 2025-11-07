/**
 * TypeScript type definitions for Storyteller Suite plugin
 * These interfaces define the data structures used throughout the plugin
 */

/**
 * Relationship types for network graph visualization
 */
export type RelationshipType = 
    | 'ally' 
    | 'enemy' 
    | 'family' 
    | 'rival' 
    | 'romantic' 
    | 'mentor' 
    | 'acquaintance' 
    | 'neutral' 
    | 'custom';

/**
 * Typed relationship for network graph connections
 * Supports both simple string references and detailed typed relationships
 */
export interface TypedRelationship {
    /** Target entity name or ID */
    target: string;
    /** Type of relationship for color-coding */
    type: RelationshipType;
    /** Optional descriptive label */
    label?: string;
}

/**
 * Filters for network graph visualization
 */
export interface GraphFilters {
    /** Filter by specific group IDs */
    groups?: string[];
    /** Filter events after this date */
    timelineStart?: string;
    /** Filter events before this date */
    timelineEnd?: string;
    /** Filter by entity types to show */
    entityTypes?: ('character' | 'location' | 'event' | 'item')[];
}

/**
 * Node in the network graph
 */
export interface GraphNode {
    /** Unique identifier */
    id: string;
    /** Display label */
    label: string;
    /** Entity type for styling */
    type: 'character' | 'location' | 'event' | 'item';
    /** Full entity data */
    data: Character | Location | Event | PlotItem;
    /** Optional image URL for node background */
    imageUrl?: string;
}

/**
 * Edge in the network graph
 */
export interface GraphEdge {
    /** Source node ID */
    source: string;
    /** Target node ID */
    target: string;
    /** Relationship type for color-coding */
    relationshipType: RelationshipType;
    /** Optional label */
    label?: string;
}

/**
 * PlotItem entity representing an important object or artifact in the story.
 * These are stored as markdown files with frontmatter in the item folder.
 */
export interface PlotItem {
    /** Optional unique identifier for the item */
    id?: string;
    
    /** File system path to the item's markdown file */
    filePath?: string;

    /** Display name of the item (e.g., "The Dragon's Tooth Dagger") */
    name: string;

    /** Path to a representative image of the item within the vault */
    profileImagePath?: string;

    /** A simple boolean to flag this as plot-critical. This is the "bookmark" */
    isPlotCritical: boolean;

    /** Visual description of the item (stored in markdown body) */
    description?: string;

    /** The origin, past events, and lore associated with the item (stored in markdown body) */
    history?: string;

    /** Link to the Character who currently possesses the item */
    currentOwner?: string;

    /** Links to Characters who previously owned the item */
    pastOwners?: string[];

    /** Link to the Location where the item currently is */
    currentLocation?: string;

    /** Links to Events where this item played a significant role */
    associatedEvents?: string[];

    /** User-defined custom fields for additional item data */
    customFields?: Record<string, string>;
    
    /** Array of group ids this item belongs to */
    groups?: string[];
    
    /** Typed connections to other entities for network graph */
    connections?: TypedRelationship[];
}

/**
 * Reference entity representing miscellaneous references for a story
 * Examples: language notes, prophecy lists, random inspiration, etc.
 * Stored as markdown files with frontmatter in the reference folder
 */
export interface Reference {
    /** Optional unique identifier for the reference */
    id?: string;

    /** File system path to the reference markdown file */
    filePath?: string;

    /** Display name of the reference (required) */
    name: string;

    /** Category of the reference (e.g., Language, Prophecy, Inspiration, Misc) */
    category?: string;

    /** Optional tags for filtering/search */
    tags?: string[];

    /** Optional representative image path within the vault */
    profileImagePath?: string;

    /** Main free-form content (stored in markdown body under `## Content`) */
    content?: string;
}

/**
 * Chapter entity representing an ordered unit in a story
 * Stores links to existing entities (characters/locations/events/items/groups)
 */
export interface Chapter {
    /** Optional unique identifier */
    id?: string;

    /** File system path to the chapter markdown file */
    filePath?: string;

    /** Display title of the chapter (required) */
    name: string;

    /** Chapter number for ordering */
    number?: number;

    /** Optional tags for filtering/search */
    tags?: string[];

    /** Optional representative image path within the vault */
    profileImagePath?: string;

    /** Short synopsis (stored under `## Summary`) */
    summary?: string;

    /** Linked entities by name (or id for groups) */
    linkedCharacters?: string[];
    linkedLocations?: string[];
    linkedEvents?: string[];
    linkedItems?: string[];
    /** Groups are internal to settings, we link by id for stability */
    linkedGroups?: string[];
}

/**
 * Scene entity representing a granular narrative unit.
 * Can be standalone or attached to a Chapter.
 */
export interface Scene {
    id?: string;
    filePath?: string;
    name: string;
    /** Optional link to a Chapter by id (undefined when unassigned) */
    chapterId?: string;
    /** Optional mirror for display/update convenience */
    chapterName?: string;
    /** Workflow status */
    status?: string; // Draft | Outline | WIP | Revised | Final | ...
    /** Ordering within a chapter */
    priority?: number;
    tags?: string[];
    profileImagePath?: string;
    /** Main prose */
    content?: string;
    /** Optional beat list */
    beats?: string[];
    /** Linked entities by name (groups by id) */
    linkedCharacters?: string[];
    linkedLocations?: string[];
    linkedEvents?: string[];
    linkedItems?: string[];
    linkedGroups?: string[];
}


/**
 * Character entity representing a person, creature, or significant figure in the story
 * Characters are stored as markdown files with frontmatter in the character folder
 */
export interface Character {
    /** Optional unique identifier for the character */
    id?: string;
    
    /** File system path to the character's markdown file */
    filePath?: string;
    
    /** Display name of the character (required) */
    name: string;
    
    /** Path to the character's profile image within the vault */
    profileImagePath?: string;
    
    /** Main description of the character (stored in markdown body) */
    description?: string;
    
    /** Array of character traits, personality attributes, or abilities */
    traits?: string[];
    
    /** Character's background story (stored in markdown body) */
    backstory?: string;
    
    /** Names/links of related characters (relationships, family, etc.) - supports both string[] and TypedRelationship[] for backward compatibility */
    relationships?: (string | TypedRelationship)[];
    
    /** Names/links of locations associated with this character */
    locations?: string[];
    
    /** Names/links of events this character was involved in */
    events?: string[];
    
    /** User-defined custom fields for additional character data */
    customFields?: Record<string, string>;
    
    /** Current status of the character (e.g., "Alive", "Deceased", "Missing") */
    status?: string;
    
    /** Character's allegiance, group, or faction (e.g., "Guild Name", "Kingdom") */
    affiliation?: string;
    
    /** Array of group ids this character belongs to */
    groups?: string[];
    
    /** Typed connections to other entities for network graph */
    connections?: TypedRelationship[];
}

/**
 * Location entity representing a place, area, or geographical feature in the story
 * Locations are stored as markdown files with frontmatter in the location folder
 */
export interface Location {
    /** Optional unique identifier for the location */
    id?: string;
    
    /** Display name of the location (required) */
    name: string;
    
    /** Main description of the location (stored in markdown body) */
    description?: string;
    
    /** Historical information about the location (stored in markdown body) */
    history?: string;
    
    /** User-defined custom fields for additional location data */
    customFields?: Record<string, string>;
    
    /** File system path to the location's markdown file */
    filePath?: string;
    
    /** Type or category of location (e.g., "City", "Forest", "Tavern") */
    locationType?: string;
    
    /** Parent region, area, or broader geographical context */
    region?: string;
    
    /** Current state of the location (e.g., "Populated", "Abandoned", "Under Siege") */
    status?: string;
    
    /** Path to a representative image of the location within the vault */
    profileImagePath?: string;
    
    /** Name or identifier of the parent location that contains this location */
    parentLocation?: string;
    
    /** Array of group ids this location belongs to */
    groups?: string[];
    
    /** Typed connections to other entities for network graph */
    connections?: TypedRelationship[];
    
    /** Primary map ID where this location is featured */
    mapId?: string;
    
    /** Additional maps where this location appears */
    relatedMapIds?: string[];
    
    /** Marker IDs representing this location on various maps */
    markerIds?: string[];
}

/**
 * Event entity representing a significant occurrence, plot point, or happening in the story
 * Events are stored as markdown files with frontmatter in the event folder
 */
export interface Event {
    /** Optional unique identifier for the event */
    id?: string;
    
    /** Display name of the event (required) */
    name: string;
    
    /** Date and/or time when the event occurred (string format for flexibility) */
    dateTime?: string;
    
    /** Main description of what happened (stored in markdown body) */
    description?: string;
    
    /** Names/links of characters who were involved in or affected by this event */
    characters?: string[];
    
    /** Name/link of the primary location where this event took place */
    location?: string;
    
    /** Results, consequences, or resolution of the event (stored in markdown body) */
    outcome?: string;
    
    /** Paths/links to images associated with this event */
    images?: string[];
    
    /** User-defined custom fields for additional event data */
    customFields?: Record<string, string>;
    
    /** File system path to the event's markdown file */
    filePath?: string;
    
    /** Current status of the event (e.g., "Upcoming", "Completed", "Ongoing") */
    status?: string;
    
    /** Path to a representative image of the event within the vault */
    profileImagePath?: string;
    
    /** Array of group ids this event belongs to */
    groups?: string[];
    
    /** Typed connections to other entities for network graph */
    connections?: TypedRelationship[];
    
    /** Flag to mark this event as a milestone (key story moment) */
    isMilestone?: boolean;
    
    /** Array of event names/ids that this event depends on (for Gantt-style dependencies) */
    dependencies?: string[];

    /** Completion progress (0-100) for tracking event status */
    progress?: number;

    /** ID of the map where this event is primarily displayed */
    mapId?: string;

    /** IDs of markers representing this event on various maps */
    markerIds?: string[];
}

/**
 * Group entity representing a user-defined collection of characters, events, and locations
 * Groups are specific to a story and can contain any mix of members from that story
 */
export interface Group {
    /** Unique identifier for the group */
    id: string;
    /** ID of the story this group belongs to */
    storyId: string;
    /** Display name of the group (required) */
    name: string;
    /** Optional description of the group */
    description?: string;
    /** Optional color for the group (for UI) */
    color?: string;
    /** Optional tags for filtering/search */
    tags?: string[];
    /** Optional representative image path within the vault */
    profileImagePath?: string;
    /** Array of group members, each with type and id */
    members: Array<{ type: 'character' | 'event' | 'location' | 'item'; id: string }>;
}

/**
 * Gallery image metadata stored in plugin settings
 * Represents an image file in the vault with associated storytelling metadata
 * The actual image files remain in their original vault locations
 */
export interface GalleryImage {
    /** Unique identifier for this gallery entry (generated automatically) */
    id: string;
    
    /** File system path to the actual image file within the vault */
    filePath: string;
    
    /** Display title for the image */
    title?: string;
    
    /** Short caption or subtitle for the image */
    caption?: string;
    
    /** Detailed description of the image content */
    description?: string;
    
    /** Names/links of characters depicted or associated with this image */
    linkedCharacters?: string[];
    
    /** Names/links of locations depicted or associated with this image */
    linkedLocations?: string[];
    
    /** Names/links of events depicted or associated with this image */
    linkedEvents?: string[];
    
    /** User-defined tags for categorizing and searching images */
    tags?: string[];
}

/**
 * Gallery data structure stored in plugin settings
 * Contains all gallery image metadata - not the actual image files
 */
export interface GalleryData {
    /** Array of all gallery image metadata entries */
    images: GalleryImage[];
}

/**
 * Story entity representing a collection of characters, locations, and events
 * Each story is isolated and has its own folders for entities
 */
export interface Story {
    /** Unique identifier for the story (generated automatically) */
    id: string;
    /** Display name of the story (required) */
    name: string;
    /** ISO string of creation date */
    created: string;
    /** Optional description of the story */
    description?: string;
}

/**
 * Map marker representing a location or point of interest on a map
 * Used for pinning locations, events, or custom points on interactive maps
 */
export interface MapMarker {
    /** Unique identifier for this marker */
    id: string;

    /** Type of entity this marker represents */
    markerType?: 'location' | 'event' | 'childMap';

    /** Name or identifier of linked location entity */
    locationName?: string;

    /** Name or identifier of linked event entity */
    eventName?: string;

    /** ID of child map this marker links to (for map portals) */
    childMapId?: string;

    /** Latitude coordinate (or Y for image-based maps) */
    lat: number;

    /** Longitude coordinate (or X for image-based maps) */
    lng: number;

    /** Icon identifier or path to custom icon image */
    icon?: string;

    /** Marker color for visual distinction */
    color?: string;

    /** Display label for the marker */
    label?: string;

    /** Marker description or notes */
    description?: string;

    /** Scale/size multiplier for the marker icon */
    scale?: number;

    /** Whether marker is currently visible */
    visible?: boolean;

    /** Minimum zoom level at which marker appears */
    minZoom?: number;

    /** Maximum zoom level at which marker appears */
    maxZoom?: number;
}

/**
 * Map layer containing a collection of related map objects
 * Enables organization and selective visibility of map elements
 */
export interface MapLayer {
    /** Unique identifier for this layer */
    id: string;
    
    /** Display name of the layer */
    name: string;
    
    /** Whether layer is currently visible */
    visible: boolean;
    
    /** Whether layer is locked from editing */
    locked?: boolean;
    
    /** Layer opacity (0-1) */
    opacity?: number;
    
    /** GeoJSON or Leaflet objects in this layer */
    objects?: any[];
    
    /** Z-index for layer ordering */
    zIndex?: number;
}

/**
 * Map entity representing an interactive geographical or spatial map
 * Maps can display locations, support custom drawings, and organize hierarchically
 * Stored as markdown files with frontmatter and JSON data
 */
export interface Map {
    /** Unique identifier for the map */
    id?: string;
    
    /** Display name of the map (required) */
    name: string;
    
    /** Detailed description of the map */
    description?: string;
    
    /** Map scale/hierarchy level */
    scale: 'world' | 'region' | 'city' | 'building' | 'custom';
    
    /** ID of parent map in hierarchy */
    parentMapId?: string;
    
    /** IDs of child maps at smaller scales */
    childMapIds?: string[];
    
    /** Path to background image file for the map */
    backgroundImagePath?: string;
    
    /** Serialized Leaflet map state (layers, drawings, etc.) */
    mapData?: string;
    
    /** Map dimensions in pixels (for image-based maps) */
    width?: number;
    height?: number;
    
    /** Default zoom level for the map */
    defaultZoom?: number;
    
    /** Center coordinates [lat, lng] for the map */
    center?: [number, number];
    
    /** Bounds for image overlay [[south, west], [north, east]] */
    bounds?: [[number, number], [number, number]];
    
    /** Array of markers placed on this map */
    markers: MapMarker[];
    
    /** Layer organization for map objects */
    layers?: MapLayer[];
    
    /** Whether grid overlay is enabled */
    gridEnabled?: boolean;
    
    /** Grid cell size in pixels or map units */
    gridSize?: number;
    
    /** GeoJSON file paths to load as layers */
    geojsonFiles?: string[];
    
    /** GPX file paths to load as tracks/waypoints */
    gpxFiles?: string[];
    
    /** Custom tile server URL template (e.g., https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png) */
    tileServer?: string;
    
    /** Enable OpenStreetMap tile layer for real-world maps */
    osmLayer?: boolean;
    
    /** Tile server subdomains (comma-separated, e.g., "a,b,c") */
    tileSubdomains?: string;
    
    /** File paths to scan for frontmatter markers */
    markerFiles?: string[];
    
    /** Folder paths to scan for frontmatter markers */
    markerFolders?: string[];
    
    /** Tags to filter markers by (requires DataView) */
    markerTags?: string[];
    
    /** File system path to the map's markdown file */
    filePath?: string;
    
    /** Path to thumbnail image for map browser */
    profileImagePath?: string;
    
    /** Names of locations featured on this map */
    linkedLocations?: string[];
    
    /** Array of group ids this map belongs to */
    groups?: string[];
    
    /** User-defined custom fields */
    customFields?: Record<string, string>;
    
    /** ISO string of creation date */
    created?: string;
    
    /** ISO string of last modification date */
    modified?: string;
}

/**
 * Map Template - Pre-configured map layouts and styles
 * Templates provide starting points for creating new maps with common configurations
 */
export interface MapTemplate {
    /** Unique identifier for the template */
    id: string;

    /** Display name of the template */
    name: string;

    /** Description of what this template is for */
    description: string;

    /** Category for organizing templates */
    category: 'world' | 'region' | 'city' | 'building' | 'dungeon' | 'battle' | 'custom';

    /** Tags for searching/filtering templates */
    tags?: string[];

    /** Path to preview/thumbnail image */
    thumbnailPath?: string;

    /** Base64 encoded preview image (for embedded templates) */
    thumbnailData?: string;

    /** Map scale this template is designed for */
    scale: 'world' | 'region' | 'city' | 'building' | 'custom';

    /** Default map dimensions */
    width?: number;
    height?: number;

    /** Default zoom level */
    defaultZoom?: number;

    /** Default center coordinates */
    center?: [number, number];

    /** Pre-configured markers */
    markers?: Partial<MapMarker>[];

    /** Grid configuration */
    gridEnabled?: boolean;
    gridSize?: number;

    /** Background image (optional - can be placeholder or actual asset) */
    backgroundImagePath?: string;
    backgroundImageData?: string; // Base64 for embedded templates

    /** Template metadata */
    author?: string;
    version?: string;
    createdDate?: string;

    /** Whether this is a built-in or user-created template */
    isBuiltIn?: boolean;

    /** Custom instructions or tips for using this template */
    usageNotes?: string;
}

/**
 * ============================================================================
 * WORLD-BUILDING ENTITIES
 * ============================================================================
 */

/**
 * Culture entity representing religions, customs, languages, and social structures
 * Stored as markdown files with frontmatter in the culture folder
 */
export interface Culture {
    /** Unique identifier */
    id?: string;

    /** File system path to the culture's markdown file */
    filePath?: string;

    /** Display name (e.g., "The Highland Clans", "Mystic Order of Keepers") */
    name: string;

    /** Path to representative image */
    profileImagePath?: string;

    /** Overview of the culture (markdown section) */
    description?: string;

    /** Cultural values, beliefs, and worldview (markdown section) */
    values?: string;

    /** Religious beliefs and practices (markdown section) */
    religion?: string;

    /** Languages spoken by this culture */
    languages?: string[];

    /** Social hierarchy and class structure (markdown section) */
    socialStructure?: string;

    /** Customs, traditions, holidays, rituals */
    customs?: string;

    /** Naming conventions (markdown section) */
    namingConventions?: string;

    /** Typical dress code and fashion */
    typicalAttire?: string;

    /** Cuisine and dining customs */
    cuisine?: string;

    /** Locations where this culture is prevalent */
    linkedLocations?: string[];

    /** Characters who belong to this culture */
    linkedCharacters?: string[];

    /** Events significant to this culture */
    linkedEvents?: string[];

    /** Related or derivative cultures */
    relatedCultures?: string[];

    /** Parent culture (if derived) */
    parentCulture?: string;

    /** Technology level */
    techLevel?: string;

    /** Government type */
    governmentType?: string;

    /** Array of group ids */
    groups?: string[];

    /** Custom fields for user-defined data */
    customFields?: Record<string, string>;

    /** Typed connections for network graph */
    connections?: TypedRelationship[];

    /** Population size estimate */
    population?: string;

    /** Historical origin and evolution (markdown section) */
    history?: string;

    /** Current status */
    status?: string;
}

/**
 * Currency sub-interface for Economy
 */
export interface Currency {
    /** Currency name (e.g., "Gold Dragons", "Imperial Credits") */
    name: string;

    /** Abbreviation/symbol (e.g., "GD", "₡") */
    symbol?: string;

    /** Exchange rate relative to base currency (1.0 = base) */
    exchangeRate?: number;

    /** Physical description */
    description?: string;

    /** Locations where this currency is accepted */
    acceptedIn?: string[];

    /** Base unit subdivisions (e.g., 100 copper = 1 silver) */
    subdivisions?: CurrencySubdivision[];
}

/**
 * Currency subdivision (e.g., copper pieces, silver pieces)
 */
export interface CurrencySubdivision {
    /** Name of subdivision (e.g., "copper piece") */
    name: string;

    /** Conversion rate to parent (e.g., 100 copper = 1 silver) */
    conversionRate: number;
}

/**
 * Resource tracked in an economy
 */
export interface Resource {
    /** Resource name (e.g., "Iron Ore", "Spice", "Mana Crystals") */
    name: string;

    /** Resource type */
    type?: string;

    /** Rarity level */
    rarity?: string;

    /** Primary production locations */
    producedAt?: string[];

    /** Value/price (in base currency) */
    value?: string;

    /** Description and uses */
    description?: string;
}

/**
 * Trade route between locations
 */
export interface TradeRoute {
    /** Route name (e.g., "Silk Road", "Northern Sea Route") */
    name: string;

    /** Origin location */
    origin: string;

    /** Destination location */
    destination: string;

    /** Intermediate waypoints */
    waypoints?: string[];

    /** Primary goods traded on this route */
    goods?: string[];

    /** Travel time/distance */
    duration?: string;

    /** Route status */
    status?: string;

    /** Description and notes */
    description?: string;

    /** Characters who control or patrol this route */
    controlledBy?: string[];
}

/**
 * Economy entity tracking currencies, trade routes, and resources
 * Stored as markdown files with frontmatter in the economy folder
 */
export interface Economy {
    /** Unique identifier */
    id?: string;

    /** File system path */
    filePath?: string;

    /** Display name (e.g., "Continental Trade Network", "Imperial Economy") */
    name: string;

    /** Representative image */
    profileImagePath?: string;

    /** Economic system overview (markdown section) */
    description?: string;

    /** Currencies used in this economy */
    currencies?: Currency[];

    /** Major resources and commodities */
    resources?: Resource[];

    /** Trade routes connecting locations */
    tradeRoutes?: TradeRoute[];

    /** Economic type */
    economicSystem?: string;

    /** Locations participating in this economy */
    linkedLocations?: string[];

    /** Factions controlling economic aspects */
    linkedFactions?: string[];

    /** Cultures participating in this economy */
    linkedCultures?: string[];

    /** Events that impacted the economy */
    linkedEvents?: string[];

    /** Current economic health */
    status?: string;

    /** Major industries and sectors (markdown section) */
    industries?: string;

    /** Tax systems and rates (markdown section) */
    taxation?: string;

    /** Array of group ids */
    groups?: string[];

    /** Custom fields */
    customFields?: Record<string, string>;

    /** Typed connections */
    connections?: TypedRelationship[];
}

/**
 * Faction member with rank and role
 */
export interface FactionMember {
    /** Character name or ID */
    characterName: string;

    /** Role/rank in the faction */
    rank?: string;

    /** Influence level within faction */
    influence?: string;

    /** Date joined */
    joinDate?: string;

    /** Additional notes */
    notes?: string;
}

/**
 * Relationship between two factions
 */
export interface FactionRelationship {
    /** Target faction name */
    targetFaction: string;

    /** Relationship type */
    relationship: string;

    /** Relationship strength (-100 to 100, negative = hostile) */
    strength?: number;

    /** Public vs private stance */
    public?: boolean;

    /** Description and context */
    description?: string;

    /** Treaties or agreements in place */
    treaties?: string[];
}

/**
 * Faction entity representing governments, organizations, and power structures
 * Stored as markdown files with frontmatter in the faction folder
 */
export interface Faction {
    /** Unique identifier */
    id?: string;

    /** File system path */
    filePath?: string;

    /** Display name (e.g., "The Crimson Council", "Empire of the Sun") */
    name: string;

    /** Representative image/banner */
    profileImagePath?: string;

    /** Faction overview (markdown section) */
    description?: string;

    /** Faction type */
    factionType?: string;

    /** Founding and historical background (markdown section) */
    history?: string;

    /** Political structure and leadership (markdown section) */
    structure?: string;

    /** Goals, motivations, and agenda (markdown section) */
    goals?: string;

    /** Resources and capabilities (markdown section) */
    resources?: string;

    /** Members and leadership */
    members?: FactionMember[];

    /** Territories controlled by this faction */
    territories?: string[];

    /** Relationships with other factions */
    factionRelationships?: FactionRelationship[];

    /** Events this faction participated in */
    linkedEvents?: string[];

    /** Associated culture */
    linkedCulture?: string;

    /** Parent faction (if sub-organization) */
    parentFaction?: string;

    /** Sub-factions or branches */
    subfactions?: string[];

    /** Faction strength */
    strength?: string;

    /** Current status */
    status?: string;

    /** Military strength rating (1-10 or custom) */
    militaryPower?: number;

    /** Economic strength rating (1-10 or custom) */
    economicPower?: number;

    /** Political influence rating (1-10 or custom) */
    politicalInfluence?: number;

    /** Faction colors for visualization */
    colors?: string[];

    /** Faction symbol/emblem description */
    emblem?: string;

    /** Motto or slogan */
    motto?: string;

    /** Array of group ids */
    groups?: string[];

    /** Custom fields */
    customFields?: Record<string, string>;

    /** Typed connections */
    connections?: TypedRelationship[];
}

/**
 * Magic or technology category/school
 */
export interface MagicCategory {
    /** Category name (e.g., "Fire Magic", "Cybernetic Enhancement") */
    name: string;

    /** Category description */
    description?: string;

    /** Difficulty level */
    difficulty?: string;

    /** Rarity of practitioners */
    rarity?: string;
}

/**
 * Individual magical ability or technological capability
 */
export interface MagicAbility {
    /** Ability name (e.g., "Fireball", "Teleportation", "Nano-Healing") */
    name: string;

    /** Category this ability belongs to */
    category?: string;

    /** Description and effects */
    description?: string;

    /** Cost to use (mana, energy, stamina, etc.) */
    cost?: string;

    /** Limitations and restrictions */
    limitations?: string;

    /** Required skill level */
    requiredLevel?: string;

    /** Characters who possess this ability */
    knownBy?: string[];

    /** Power rating (1-10 or custom scale) */
    powerRating?: number;
}

/**
 * Consistency rule for magic/tech system
 */
export interface ConsistencyRule {
    /** Rule name */
    name: string;

    /** Rule description */
    description: string;

    /** Rule type */
    type: string;

    /** Consequences of breaking this rule */
    consequences?: string;
}

/**
 * MagicSystem entity defining magical or technological rules and limitations
 * Stored as markdown files with frontmatter in the magic systems folder
 */
export interface MagicSystem {
    /** Unique identifier */
    id?: string;

    /** File system path */
    filePath?: string;

    /** Display name (e.g., "Elemental Magic", "Nanotechnology", "Psionics") */
    name: string;

    /** Representative image */
    profileImagePath?: string;

    /** System overview (markdown section) */
    description?: string;

    /** System type */
    systemType?: string;

    /** Fundamental rules and mechanics (markdown section) */
    rules?: string;

    /** Source of power (markdown section) */
    source?: string;

    /** Costs and limitations (markdown section) */
    costs?: string;

    /** What cannot be done with this system (markdown section) */
    limitations?: string;

    /** Schools, disciplines, or categories */
    categories?: MagicCategory[];

    /** Abilities, spells, or technologies */
    abilities?: MagicAbility[];

    /** Materials, components, or requirements */
    materials?: string[];

    /** Training and learning methods (markdown section) */
    training?: string;

    /** Characters who use this system */
    linkedCharacters?: string[];

    /** Locations where this system is prevalent */
    linkedLocations?: string[];

    /** Cultures that practice this system */
    linkedCultures?: string[];

    /** Events that shaped this system */
    linkedEvents?: string[];

    /** Items powered by this system */
    linkedItems?: string[];

    /** Rarity level */
    rarity?: string;

    /** Power level */
    powerLevel?: string;

    /** Current state */
    status?: string;

    /** Historical origins (markdown section) */
    history?: string;

    /** Consistency checks and rules enforcement */
    consistencyRules?: ConsistencyRule[];

    /** Array of group ids */
    groups?: string[];

    /** Custom fields */
    customFields?: Record<string, string>;

    /** Typed connections */
    connections?: TypedRelationship[];
}

/**
 * Calendar date representation
 */
export interface CalendarDate {
    /** Year */
    year?: number;

    /** Month (1-based) */
    month: number;

    /** Day (1-based) */
    day: number;

    /** Hour (0-23, optional for time of day) */
    hour?: number;

    /** Minute (0-59, optional) */
    minute?: number;

    /** Era or epoch (e.g., "AE" for After Empire) */
    era?: string;
}

/**
 * Month in a custom calendar
 */
export interface CalendarMonth {
    /** Month name (e.g., "Frostfall", "Hearthfire") */
    name: string;

    /** Number of days in this month */
    days: number;

    /** Month number (1-based) */
    number: number;

    /** Season this month belongs to */
    season?: string;

    /** Description or cultural significance */
    description?: string;
}

/**
 * Holiday or special day in a calendar
 */
export interface CalendarHoliday {
    /** Holiday name */
    name: string;

    /** Date in calendar */
    date: CalendarDate;

    /** Description and significance */
    description?: string;

    /** Cultures that celebrate this holiday */
    cultures?: string[];

    /** How the holiday is celebrated (markdown) */
    celebration?: string;

    /** Duration in days (for multi-day holidays) */
    duration?: number;

    /** Recurring: true = annual, false = one-time */
    recurring?: boolean;
}

/**
 * Astronomical event (eclipse, comet, etc.)
 */
export interface AstronomicalEvent {
    /** Event name (e.g., "Solar Eclipse", "Red Moon") */
    name: string;

    /** Date(s) of occurrence */
    dates: CalendarDate[];

    /** Event type */
    type?: string;

    /** Description and effects */
    description?: string;

    /** Cultural or magical significance */
    significance?: string;

    /** Frequency */
    frequency?: string;
}

/**
 * Season definition
 */
export interface Season {
    /** Season name (e.g., "Spring", "The Long Dark") */
    name: string;

    /** Months included in this season */
    months: string[];

    /** Description and characteristics */
    description?: string;

    /** Climate and weather patterns */
    weather?: string;
}

/**
 * Calendar entity with custom months, holidays, and astronomical events
 * Stored as markdown files with frontmatter in the calendar folder
 */
export interface Calendar {
    /** Unique identifier */
    id?: string;

    /** File system path */
    filePath?: string;

    /** Display name (e.g., "Imperial Calendar", "Lunar Cycle") */
    name: string;

    /** Representative image */
    profileImagePath?: string;

    /** Calendar overview (markdown section) */
    description?: string;

    /** Calendar type */
    calendarType?: string;

    /** Number of days in a year */
    daysPerYear?: number;

    /** Months in the calendar */
    months?: CalendarMonth[];

    /** Weekdays */
    weekdays?: string[];

    /** Days per week */
    daysPerWeek?: number;

    /** Holidays and special days */
    holidays?: CalendarHoliday[];

    /** Astronomical events (eclipses, meteor showers, etc.) */
    astronomicalEvents?: AstronomicalEvent[];

    /** Seasons */
    seasons?: Season[];

    /** Current date in this calendar (for tracking story time) */
    currentDate?: CalendarDate;

    /** "Today" reference for date calculations */
    referenceDate?: CalendarDate;

    /** How this calendar relates to Earth calendar (for conversion) */
    earthConversion?: string;

    /** Cultures that use this calendar */
    linkedCultures?: string[];

    /** Locations where this calendar is used */
    linkedLocations?: string[];

    /** Historical origin (markdown section) */
    history?: string;

    /** Current usage */
    usage?: string;

    /** Array of group ids */
    groups?: string[];

    /** Custom fields */
    customFields?: Record<string, string>;
}

/**
 * ============================================================================
 * TIMELINE & CAUSALITY ENTITIES
 * ============================================================================
 */

/**
 * Altered entity in a timeline fork
 */
export interface AlteredEntity {
    /** Entity ID or name */
    entityId: string;

    /** Entity type */
    entityType: 'character' | 'location' | 'event' | 'item';

    /** What changed in this timeline */
    alteration: string;

    /** Original state/value */
    originalState?: string;

    /** New state/value in this fork */
    newState?: string;
}

/**
 * Timeline fork for "What-If" scenarios
 * Stored in plugin settings
 */
export interface TimelineFork {
    /** Unique identifier */
    id: string;

    /** Display name (e.g., "What if the hero died?") */
    name: string;

    /** Parent timeline ID (undefined = main timeline) */
    parentTimelineId?: string;

    /** Event that caused the fork (divergence point) */
    divergenceEvent: string;

    /** Date of divergence */
    divergenceDate: string;

    /** Description of what changed */
    description: string;

    /** Status */
    status: string;

    /** Events unique to this timeline */
    forkEvents: string[];

    /** Characters with different fates in this timeline */
    alteredCharacters: AlteredEntity[];

    /** Locations with different states */
    alteredLocations: AlteredEntity[];

    /** Color for visualization */
    color?: string;

    /** Creation date */
    created: string;

    /** Custom notes */
    notes?: string;
}

/**
 * Causality link between events (cause and effect)
 * Stored in plugin settings or as part of Event entities
 */
export interface CausalityLink {
    /** Unique identifier */
    id: string;

    /** Source event (the cause) */
    causeEvent: string;

    /** Target event (the effect) */
    effectEvent: string;

    /** Link type */
    linkType: string;

    /** Strength of causal relationship */
    strength?: string;

    /** Description of how cause leads to effect */
    description?: string;

    /** Time delay between cause and effect */
    delay?: string;

    /** Conditions required for effect to occur */
    conditions?: string[];

    /** Probability of effect given cause (0-100) */
    probability?: number;
}

/**
 * Entity involved in a conflict
 */
export interface ConflictEntity {
    /** Entity ID */
    entityId: string;

    /** Entity type */
    entityType: 'character' | 'location' | 'event' | 'item';

    /** Entity name for display */
    entityName: string;

    /** Specific field with conflict */
    conflictField?: string;

    /** Conflicting value */
    conflictValue?: string;
}

/**
 * Timeline conflict detected by the system
 * Stored in plugin settings, generated dynamically
 */
export interface TimelineConflict {
    /** Unique identifier */
    id: string;

    /** Conflict type */
    type: string;

    /** Severity level */
    severity: string;

    /** Entities involved in the conflict */
    entities: ConflictEntity[];

    /** Events involved */
    events: string[];

    /** Description of the conflict */
    description: string;

    /** Suggested resolution */
    suggestion?: string;

    /** User-dismissed conflicts */
    dismissed?: boolean;

    /** Detection date */
    detected: string;
}

/**
 * Pacing information for a chapter
 */
export interface ChapterPacing {
    /** Chapter name or ID */
    chapterId: string;
    chapterName: string;

    /** Number of events in this chapter */
    eventCount: number;

    /** Word count (if available) */
    wordCount?: number;

    /** Pacing rating */
    pacing: string;

    /** Tension level (1-10) */
    tension: number;

    /** Character screen time distribution */
    characterAppearances: Record<string, number>;
}

/**
 * Event density over a time period
 */
export interface EventDensity {
    /** Time period (e.g., "Chapter 1", "Day 1-10") */
    period: string;

    /** Number of events */
    count: number;

    /** Start date */
    startDate: string;

    /** End date */
    endDate: string;
}

/**
 * Tension point in the story
 */
export interface TensionPoint {
    /** Position in story (0-1, where 0=start, 1=end) */
    position: number;

    /** Tension level (1-10) */
    tension: number;

    /** Associated chapter */
    chapterId?: string;

    /** Associated event */
    eventId?: string;
}

/**
 * Pacing recommendation
 */
export interface PacingRecommendation {
    /** Recommendation type */
    type: string;

    /** Location in story */
    location: string;

    /** Description */
    description: string;

    /** Priority */
    priority: string;
}

/**
 * Story pacing analysis
 * Calculated dynamically, optionally cached in plugin settings
 */
export interface PacingAnalysis {
    /** Overall pacing score (1-10) */
    overallScore: number;

    /** Pacing by chapter/act */
    chapterPacing: ChapterPacing[];

    /** Event density over time */
    eventDensity: EventDensity[];

    /** Tension curve over story */
    tensionCurve: TensionPoint[];

    /** Recommendations */
    recommendations: PacingRecommendation[];

    /** Analysis timestamp */
    analyzed: string;
}

/**
 * ============================================================================
 * WRITING ANALYTICS ENTITIES
 * ============================================================================
 */

/**
 * Writing session tracking
 * Stored in plugin settings
 */
export interface WritingSession {
    /** Unique identifier */
    id: string;

    /** Session start time */
    startTime: string;

    /** Session end time */
    endTime: string;

    /** Words written (delta) */
    wordsWritten: number;

    /** Characters modified */
    charactersModified: string[];

    /** Locations modified */
    locationsModified: string[];

    /** Events created/modified */
    eventsModified: string[];

    /** Chapters worked on */
    chaptersModified: string[];

    /** Scenes worked on */
    scenesModified: string[];

    /** Session notes */
    notes?: string;
}

/**
 * Character screen time statistics
 */
export interface CharacterScreenTime {
    /** Character name */
    characterName: string;

    /** Number of chapters they appear in */
    chaptersAppeared: number;

    /** Number of scenes they appear in */
    scenesAppeared: number;

    /** Estimated "on-screen" percentage */
    screenTimePercentage: number;

    /** Dialogue count */
    dialogueLines?: number;

    /** First appearance */
    firstAppearance?: string;

    /** Last appearance */
    lastAppearance?: string;
}

/**
 * Event distribution analysis
 */
export interface EventDistribution {
    /** Events by time period */
    byTimePeriod: Record<string, number>;

    /** Events by location */
    byLocation: Record<string, number>;

    /** Events by type/status */
    byStatus: Record<string, number>;
}

/**
 * Dialogue vs narration analysis
 */
export interface DialogueAnalysis {
    /** Total dialogue word count */
    dialogueWords: number;

    /** Total narration word count */
    narrationWords: number;

    /** Ratio (dialogue / total) */
    ratio: number;

    /** By chapter */
    byChapter: Record<string, { dialogue: number; narration: number }>;
}

/**
 * Point of view statistics
 */
export interface POVStats {
    /** POV character name */
    characterName: string;

    /** Word count from this POV */
    wordCount: number;

    /** Percentage of total story */
    percentage: number;

    /** Chapters from this POV */
    chapters: string[];
}

/**
 * Writing velocity data point
 */
export interface VelocityData {
    /** Date */
    date: string;

    /** Words written that day */
    wordsWritten: number;

    /** Cumulative word count */
    cumulativeWords: number;
}

/**
 * Foreshadowing setup/payoff pair
 */
export interface ForeshadowingPair {
    /** Unique identifier */
    id: string;

    /** Setup event/scene */
    setup: string;

    /** Payoff event/scene (undefined if not yet paid off) */
    payoff?: string;

    /** Description of the foreshadowing */
    description: string;

    /** Status */
    status: string;

    /** Time between setup and payoff */
    timeSpan?: string;

    /** Tags for categorization */
    tags?: string[];
}

/**
 * Story analytics aggregated data
 * Stored in plugin settings, updated periodically or on-demand
 */
export interface StoryAnalytics {
    /** Total word count across all chapters/scenes */
    totalWordCount: number;

    /** Word count by chapter */
    wordCountByChapter: Record<string, number>;

    /** Word count by scene */
    wordCountByScene: Record<string, number>;

    /** Character appearances (screen time) */
    characterScreenTime: Record<string, CharacterScreenTime>;

    /** Location usage frequency */
    locationUsage: Record<string, number>;

    /** Event distribution over timeline */
    eventDistribution: EventDistribution;

    /** Dialogue vs narration ratio */
    dialogueRatio: DialogueAnalysis;

    /** POV distribution */
    povDistribution: Record<string, POVStats>;

    /** Writing velocity (words per day) */
    writingVelocity: VelocityData[];

    /** Foreshadowing tracker */
    foreshadowing: ForeshadowingPair[];

    /** Last updated */
    lastUpdated: string;
}

/**
 * ============================================================================
 * SENSORY WORLD BUILDER ENTITIES
 * ============================================================================
 */

/**
 * Atmosphere profile for a location
 */
export interface AtmosphereProfile {
    /** Overall atmosphere */
    overall?: string;

    /** Lighting conditions */
    lighting?: string;

    /** Weather (if applicable) */
    weather?: string;

    /** Temperature feel */
    temperature?: string;

    /** Air quality */
    airQuality?: string;
}

/**
 * Sensory details for all five senses
 */
export interface SensoryDetails {
    /** What can be seen */
    sight?: string;

    /** What can be heard */
    sound?: string;

    /** What can be smelled */
    smell?: string;

    /** What can be felt (touch/texture) */
    touch?: string;

    /** What can be tasted (if relevant) */
    taste?: string;
}

/**
 * Mood/emotion profile
 */
export interface MoodProfile {
    /** Primary mood */
    primary?: string;

    /** Secondary moods */
    secondary?: string[];

    /** Emotional impact description */
    description?: string;

    /** Intensity (1-10) */
    intensity?: number;
}

/**
 * Color palette for a location
 */
export interface ColorPalette {
    /** Primary colors (hex codes) */
    primary: string[];

    /** Accent colors */
    accent?: string[];

    /** Palette name */
    name?: string;

    /** Palette description */
    description?: string;
}

/**
 * Ambient sound
 */
export interface AmbientSound {
    /** Sound description (e.g., "distant bells", "crackling fire") */
    description: string;

    /** Sound type */
    type?: string;

    /** Volume level */
    volume?: string;

    /** Frequency */
    frequency?: string;
}

/**
 * Sound profile for a location
 */
export interface SoundProfile {
    /** Ambient sound categories */
    sounds: AmbientSound[];

    /** Overall sound level */
    volume?: string;

    /** Sound quality */
    quality?: string;
}

/**
 * Time of day variation
 */
export interface TimeVariation {
    /** Time of day */
    timeOfDay: string;

    /** Description of changes at this time */
    description: string;

    /** Lighting changes */
    lighting?: string;

    /** Atmosphere changes */
    atmosphere?: string;

    /** Sound changes */
    sounds?: string[];
}

/**
 * Seasonal variation
 */
export interface SeasonalVariation {
    /** Season name */
    season: string;

    /** Description of seasonal changes */
    description: string;

    /** Weather changes */
    weather?: string;

    /** Visual changes */
    appearance?: string;

    /** Activity changes */
    activities?: string;
}

/**
 * Sensory profile extension for Location entities
 * Stored as additional markdown sections in Location files
 */
export interface LocationSensoryProfile {
    /** Location this profile belongs to */
    locationId: string;

    /** Visual atmosphere */
    atmosphere?: AtmosphereProfile;

    /** Sensory details */
    sensory?: SensoryDetails;

    /** Mood/emotion evoked */
    mood?: MoodProfile;

    /** Color palette */
    colors?: ColorPalette;

    /** Ambient sounds */
    ambientSounds?: SoundProfile;

    /** Time-of-day variations */
    timeVariations?: TimeVariation[];

    /** Seasonal variations */
    seasonalVariations?: SeasonalVariation[];
}