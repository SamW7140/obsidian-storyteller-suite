import { App, Notice, TFile } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import type { Character, Event, Location, Scene, TimelineFork, TimelineTrack } from '../types';
import { EventModal } from '../modals/EventModal';
import { parseEventDate, toMillis } from './DateParsing';
import type { DetectedConflict } from './ConflictDetector';
import { ConflictDetector } from './ConflictDetector';
import { CalendarRegistry } from '../calendar/CalendarRegistry';
import { GREGORIAN_CALENDAR } from '../calendar/builtins';
import { parseToAbsoluteDay, formatAbsoluteDay } from '../calendar/CalendarDateText';
import { daysInYear, fromAbsolute, monthsInYear, normalYearLength, toAbsolute } from '../calendar/CalendarEngine';
import type { CalendarSystem } from '../calendar/types';
import { chooseSnapResolution, generateTicks, snapDay, snapSlots, stepDay } from '../calendar/TimelineAxis';
import type { AxisView, SnapResolution } from '../calendar/TimelineAxis';

export interface TimelineRendererOptions {
    ganttMode?: boolean;
    timelineOrientation?: 'horizontal' | 'vertical';
    groupMode?: 'none' | 'location' | 'group' | 'character' | 'track';
    showDependencies?: boolean;
    showProgressBars?: boolean;
    dependencyArrowStyle?: 'solid' | 'dashed' | 'dotted';
    stackEnabled?: boolean;
    density?: number;
    defaultGanttDuration?: number;
    editMode?: boolean;
    showEras?: boolean;
    narrativeOrder?: boolean;
    onConflictsDetected?: (conflicts: DetectedConflict[]) => void;
    onEventSelected?: (event: Event | null) => void;
    /** Fired after each frame so a toolbar can mirror the visible range. */
    onViewChange?: () => void;
}

export interface TimelineFilters {
    characters?: Set<string>;
    locations?: Set<string>;
    groups?: Set<string>;
    milestonesOnly?: boolean;
    tags?: Set<string>;
    eras?: Set<string>;
    forkId?: string;
}

/**
 * A scene placed on the timeline is adapted into an Event so it can share the
 * layout and filter paths. Event.location is a single value while a scene can
 * link several, so the full list rides along here. Renderer-local and never
 * written back to a note.
 */
type TimelineEvent = Event & { _sceneLocations?: string[] };

interface NativeItem {
    id: string;
    event: Event;
    eventIndex: number;
    start: number;
    end: number;
    laneId: string;
    laneLabel: string;
    laneColor: string;
    row: number;
    rect?: DOMRect;
    forkId?: string;
    inherited?: boolean;
    /**
     * Set when the chip has no room to draw without covering its neighbour.
     * The event still renders as a marker on the axis, so it is never silently
     * dropped, but the label that would be unreadable is left out.
     */
    labelSuppressed?: boolean;
    /** Date was written loosely, so the chip is outlined rather than solid. */
    approximate?: boolean;
    /**
     * Colour the user actually chose, from the event itself or from an
     * explicitly coloured track, group or fork. Undefined when the colour in
     * play is only a palette default, which is what lets milestone gold apply
     * without a deliberate choice being overridden.
     */
    customColor?: string;
}

interface Lane {
    id: string;
    label: string;
    color: string;
    /** True when `color` was chosen by the user, not taken from the palette. */
    explicitColor?: boolean;
    items: NativeItem[];
    /** Running maximum of item ends, parallel to `items`. Non-decreasing. */
    maxEndPrefix?: number[];
    top: number;
    height: number;
    branchDepth?: number;
}

interface CalendarBand {
    startDay: number;
    endDay: number;
    label: string;
    group: string;
    color: string;
    row: number;
    kind: 'cycle' | 'holiday';
}

const DAY_MS = 86_400_000;
const YEAR_MS = 365.2425 * DAY_MS;
const SIDEBAR_WIDTH = 174;
const BASE_AXIS_HEIGHT = 42;
const CALENDAR_BAND_HEIGHT = 16;
const MAX_SPAN = 2_000_000 * YEAR_MS;
const MAX_CHIP_WIDTH = 210;
const MIN_CHIP_WIDTH = 88;
const MIN_CHRONOLOGY_CHIP_WIDTH = 92;
/** Breathing room kept between two chips on the same row. */
const CHIP_GAP = 8;
/** Distance from a chronology lane's top to its first row of chips. */
const CHRONOLOGY_CHIP_TOP = 34;
/** A wheel notch in line mode is worth roughly this many pixels. */
const WHEEL_LINE_HEIGHT = 16;
/** Milestone gold, overridable through --sts-timeline-milestone. */
const MILESTONE_GOLD = '#d9a520';
/** Radius of an empty date slot on the lane baseline. */
const SLOT_RADIUS = 3;
const SLOT_COLOR = '#0b0f16';
/** How close a pointer must be to an axis marker to grab it. */
const MARKER_GRAB_RADIUS = 11;
const MILESTONE_GOLD_EDGE = '#8a6410';

export class NativeTimelineRenderer {
    private readonly app: App;
    private readonly plugin: StorytellerSuitePlugin;
    private readonly container: HTMLElement;
    private readonly calendarRegistry: CalendarRegistry;
    private options: Required<Omit<TimelineRendererOptions, 'onConflictsDetected' | 'onEventSelected' | 'onViewChange'>> & Pick<TimelineRendererOptions, 'onConflictsDetected' | 'onEventSelected' | 'onViewChange'>;
    private filters: TimelineFilters = {};
    private events: Event[] = [];
    private locations: Location[] = [];
    private characters: Character[] = [];
    private scenes: Scene[] = [];
    private watchedNotes: Array<{ name: string; date: string; filePath: string }> = [];
    private showScenes = false;
    private showWatchedNotes = false;
    private root: HTMLElement | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private frame = 0;
    private lanes: Lane[] = [];
    private visibleItems: NativeItem[] = [];
    private selected: NativeItem | null = null;
    private conflictsByEvent = new Map<string, DetectedConflict[]>();
    private tooltipEl: HTMLElement | null = null;
    private hovered: NativeItem | null = null;
    private viewStart = Date.now() - YEAR_MS;
    private viewEnd = Date.now() + YEAR_MS;
    private scrollTop = 0;
    private dragging: { kind: 'pan' | 'move' | 'marker'; x: number; y: number; start: number; end: number; item?: NativeItem } | null = null;
    /**
     * Where a marker drag would land. Held apart from the item so the lane does
     * not repack under the cursor mid-drag — the item only moves on release.
     */
    private dragGhost: number | null = null;
    /** Snap boundaries across the current view, in milliseconds. One per draw. */
    private slotTimes: number[] = [];
    /** Axis markers drawn this frame, as drag targets. */
    private markerHits: { item: NativeItem; x: number; y: number }[] = [];
    private activePointers = new Map<number, { x: number; y: number }>();
    private pinch: { distance: number; span: number; anchorTime: number } | null = null;
    private referenceDate = new Date();
    private palette = ['#7c3aed', '#2563eb', '#059669', '#ca8a04', '#dc2626', '#ea580c', '#0ea5e9', '#22c55e', '#d946ef', '#f59e0b'];

    constructor(container: HTMLElement, plugin: StorytellerSuitePlugin, options: TimelineRendererOptions = {}) {
        this.container = container;
        this.plugin = plugin;
        this.app = plugin.app;
        this.calendarRegistry = new CalendarRegistry(plugin);
        this.options = {
            ganttMode: false,
            timelineOrientation: 'horizontal',
            groupMode: 'none',
            showDependencies: true,
            showProgressBars: true,
            dependencyArrowStyle: 'solid',
            stackEnabled: true,
            density: 50,
            defaultGanttDuration: 1,
            editMode: false,
            showEras: false,
            narrativeOrder: false,
            ...options
        };
    }

    async initialize(): Promise<void> {
        this.events = await this.plugin.listEvents();
        this.locations = await this.plugin.listLocations();
        this.characters = await this.plugin.listCharacters();
        await this.loadOptionalSources();
        this.mount();
        this.rebuild(true);
    }

    async refresh(): Promise<void> {
        this.events = await this.plugin.listEvents();
        this.locations = await this.plugin.listLocations();
        this.characters = await this.plugin.listCharacters();
        await this.loadOptionalSources();
        this.rebuild(false);
    }

    applyFilters(filters: Partial<TimelineFilters>): void { this.filters = { ...this.filters, ...filters }; this.rebuild(false); }
    setGanttMode(value: boolean): void { this.options.ganttMode = value; this.rebuild(false); }
    setTimelineOrientation(value: 'horizontal' | 'vertical'): void { this.options.timelineOrientation = value; this.rebuild(false); }
    setGroupMode(value: TimelineRendererOptions['groupMode']): void { this.options.groupMode = value || 'none'; this.rebuild(false); }
    // Redraws because edit mode is not just an input mode: it decides whether
    // the date slots are drawn and whether the markers register as drag
    // targets, so toggling it without a repaint leaves both dead.
    setEditMode(value: boolean): void { this.options.editMode = value; this.container.toggleClass('is-editing', value); this.scheduleDraw(); }
    setShowEras(value: boolean): void { this.options.showEras = value; this.scheduleDraw(); }
    setNarrativeOrder(value: boolean): void { this.options.narrativeOrder = value; this.rebuild(false); }
    setShowScenes(value: boolean): void { this.showScenes = value; this.rebuild(false); }
    setShowWatchedNotes(value: boolean): void { this.showWatchedNotes = value; this.rebuild(false); }
    setStackEnabled(value: boolean): void { this.options.stackEnabled = value; this.rebuild(false); }
    setDensity(value: number): void { this.options.density = Math.max(0, Math.min(100, value)); this.rebuild(false); }
    redraw(): void { this.resizeCanvas(); this.scheduleDraw(); }

    destroy(): void {
        if (this.frame) (this.container.ownerDocument.defaultView || window).cancelAnimationFrame(this.frame);
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.root?.remove();
        this.root = null;
        this.canvas = null;
        this.ctx = null;
        this.tooltipEl = null;
        this.hovered = null;
    }

    getVisibleEvents(): Event[] {
        return this.events.filter(event => this.shouldInclude(event) && this.matchesFork(event)).sort((a, b) => this.eventStart(a) - this.eventStart(b));
    }

    searchVisibleEvents(query: string, limit = 12): Event[] {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return this.getVisibleEvents().map(event => ({ event, score: this.searchScore(event, q) }))
            .filter(entry => entry.score >= 0).sort((a, b) => b.score - a.score).slice(0, limit).map(entry => entry.event);
    }

    focusEventByQuery(query: string): Event | null {
        const event = this.searchVisibleEvents(query, 1)[0] || null;
        if (event) this.focusEvent(event);
        return event;
    }

    focusEvent(event: Event): boolean {
        const item = this.lanes.reduce<NativeItem | undefined>((found, lane) => found || lane.items.find(candidate => candidate.event === event || this.eventKey(candidate.event) === this.eventKey(event)), undefined);
        if (!item) return false;
        const span = Math.max(this.viewEnd - this.viewStart, DAY_MS * 14);
        const center = (item.start + item.end) / 2;
        this.viewStart = center - span / 2;
        this.viewEnd = center + span / 2;
        this.selected = item;
        this.options.onEventSelected?.(event);
        this.ensureLaneVisible(item.laneId);
        this.scheduleDraw();
        return true;
    }

    fitToView(): void {
        const items = this.lanes.flatMap(lane => lane.items);
        if (!items.length) return;
        const min = Math.min(...items.map(item => item.start));
        const max = Math.max(...items.map(item => item.end));
        const pad = Math.max((max - min) * 0.08, DAY_MS * 3);
        this.viewStart = min - pad;
        this.viewEnd = max + pad;
        this.scrollTop = 0;
        this.scheduleDraw();
    }

    zoomPresetYears(years: number): void {
        const center = (this.viewStart + this.viewEnd) / 2;
        const span = Math.max(1, years) * YEAR_MS;
        this.viewStart = center - span / 2;
        this.viewEnd = center + span / 2;
        this.scheduleDraw();
    }

    zoomBy(factor: number): void {
        const center = (this.viewStart + this.viewEnd) / 2;
        const span = Math.max(this.minimumSpan(), Math.min(MAX_SPAN, (this.viewEnd - this.viewStart) * factor));
        this.viewStart = center - span / 2;
        this.viewEnd = center + span / 2;
        this.scheduleDraw();
    }

    moveToToday(): void {
        const span = this.viewEnd - this.viewStart;
        const now = Date.now();
        this.viewStart = now - span / 2;
        this.viewEnd = now + span / 2;
        this.scheduleDraw();
    }

    setVisibleRange(start: Date, end: Date): void {
        if (end.getTime() <= start.getTime()) return;
        this.viewStart = start.getTime();
        this.viewEnd = end.getTime();
        this.scheduleDraw();
    }

    getVisibleRange(): { start: Date; end: Date } { return { start: new Date(this.viewStart), end: new Date(this.viewEnd) }; }
    getEventCount(): number { return this.events.filter(event => this.shouldInclude(event) && this.matchesFork(event)).length; }

    getDateRange(): { start: Date; end: Date } | null {
        const events = this.getVisibleEvents();
        if (!events.length) return null;
        const starts = events.map(event => this.eventStart(event)).filter(Number.isFinite);
        if (!starts.length) return null;
        return { start: new Date(Math.min(...starts)), end: new Date(Math.max(...starts)) };
    }

    async exportAsImage(format: 'png' | 'jpg'): Promise<void> {
        if (!this.canvas) return;
        const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
        const link = this.container.ownerDocument.createElement('a');
        link.download = `timeline-${new Date().toISOString().slice(0, 10)}.${format}`;
        link.href = this.canvas.toDataURL(mime, 0.94);
        link.click();
    }

    async exportAsCsv(): Promise<void> { await this.writeExport('csv', this.toCsv()); }
    async exportAsJson(): Promise<void> { await this.writeExport('json', JSON.stringify(this.getVisibleEvents(), null, 2)); }
    async exportAsMarkdown(): Promise<void> {
        const body = this.getVisibleEvents().map(event => `- **${event.name}** (${event.dateTime || 'Undated'})${event.description ? ` - ${event.description}` : ''}`).join('\n');
        await this.writeExport('md', `# Timeline\n\n${body}\n`);
    }

    private mount(): void {
        this.destroy();
        this.container.empty();
        this.root = this.container.createDiv('sts-native-timeline');
        this.root.setAttribute('tabindex', '0');
        this.root.setAttribute('role', 'application');
        this.root.setAttribute('aria-label', 'Story timeline');
        this.canvas = this.root.createEl('canvas', { cls: 'sts-native-timeline-canvas' });
        this.ctx = this.canvas.getContext('2d');
        this.tooltipEl = this.root.createDiv('sts-native-timeline-tooltip');
        this.tooltipEl.hide();
        this.bindEvents();
        this.resizeObserver = new ResizeObserver(() => this.redraw());
        this.resizeObserver.observe(this.root);
        this.resizeCanvas();
    }

    private bindEvents(): void {
        if (!this.canvas || !this.root) return;
        this.canvas.addEventListener('pointerdown', event => this.onPointerDown(event));
        this.canvas.addEventListener('pointermove', event => this.onPointerMove(event));
        this.canvas.addEventListener('pointerup', event => { void this.onPointerUp(event); });
        this.canvas.addEventListener('pointercancel', event => { void this.onPointerUp(event); });
        this.canvas.addEventListener('dblclick', event => this.openAt(event.offsetX, event.offsetY));
        this.canvas.addEventListener('wheel', event => this.onWheel(event), { passive: false });
        this.canvas.addEventListener('pointerleave', () => this.hideTooltip());
        this.root.addEventListener('keydown', event => this.onKeyDown(event));
    }

    private rebuild(fit: boolean): void {
        this.referenceDate = new Date();
        const sourceEvents = this.collectEvents();
        // Conflict analysis is secondary to rendering and can be quadratic for
        // dense character histories. Keep large timelines interactive; users
        // can still run the dedicated conflict tools against the full dataset.
        this.conflictsByEvent.clear();
        if (sourceEvents.length <= 10_000) {
            const conflicts = ConflictDetector.detectAllConflicts(sourceEvents);
            // Keep them indexed so an item can show its own severity and the
            // tooltip can list the messages, the way the vis renderer did.
            conflicts.forEach(conflict => {
                conflict.events.forEach(event => {
                    const key = this.eventKey(event);
                    const existing = this.conflictsByEvent.get(key);
                    if (existing) existing.push(conflict);
                    else this.conflictsByEvent.set(key, [conflict]);
                });
            });
            this.options.onConflictsDetected?.(conflicts);
        }
        this.lanes = this.buildLanes(sourceEvents);
        this.layoutRows();
        if (fit) this.fitToView(); else this.scheduleDraw();
    }

    private collectEvents(): Event[] {
        const result = this.events.filter(event => this.shouldInclude(event) && this.matchesFork(event)).slice();
        if (this.showScenes) {
            this.scenes.forEach(scene => {
                if (!scene.date) return;
                // Build the full event before filtering. Filtering a partial one
                // would drop every scene the moment a character or location
                // filter is active, since the relational fields decide the match.
                const mapped = this.sceneToEvent(scene);
                if (this.shouldInclude(mapped)) result.push(mapped);
            });
        }
        // Watched notes are arbitrary vault notes picked up by a frontmatter
        // property. They carry no characters, locations, or groups, so there is
        // nothing for the entity filters to match and they always pass.
        if (this.showWatchedNotes) this.watchedNotes.forEach(note => result.push({ name: note.name, dateTime: note.date, filePath: note.filePath, tags: ['watched-note'] }));
        return result.filter(event => Number.isFinite(this.eventStart(event)));
    }

    private sceneToEvent(scene: Scene): TimelineEvent {
        const locations = scene.linkedLocations || [];
        return {
            name: scene.name,
            dateTime: scene.date,
            description: scene.synopsis || scene.content,
            filePath: scene.filePath,
            characters: scene.linkedCharacters,
            groups: scene.linkedGroups,
            // Keep the scalar populated for lane grouping and anything else
            // reading Event.location; _sceneLocations carries the rest.
            location: locations[0],
            _sceneLocations: locations.length ? locations : undefined,
            // 'scene' stays first: the show/hide toggle, the styling, and the
            // double-click guard all key off it.
            tags: ['scene', ...(scene.tags || [])],
        };
    }

    private buildLanes(events: Event[]): Lane[] {
        if (this.filters.forkId === '__compare__') return this.buildForkLanes(events);
        const laneMap = new Map<string, Lane>();
        events.forEach((event, eventIndex) => {
            const targets = this.groupTargets(event);
            targets.forEach((target, duplicateIndex) => {
                let lane = laneMap.get(target.id);
                if (!lane) {
                    lane = { ...target, items: [], top: 0, height: 0 };
                    laneMap.set(target.id, lane);
                }
                lane.items.push(this.makeItem(event, eventIndex, target, duplicateIndex));
            });
        });
        return Array.from(laneMap.values());
    }

    private buildForkLanes(events: Event[]): Lane[] {
        const forks = this.plugin.getTimelineForks();
        const byId = new Map(forks.map(fork => [fork.id, fork]));
        const mainIds = new Set(forks.flatMap(fork => fork.forkEvents || []));
        const main = events.filter(event => !mainIds.has(this.eventKey(event)));
        const lanes: Lane[] = [{ id: '__main__', label: 'Main timeline', color: this.css('--interactive-accent', '#7c3aed'), items: [], top: 0, height: 0, branchDepth: 0 }];
        main.forEach((event, index) => lanes[0].items.push(this.makeItem(event, index, lanes[0], 0)));
        const depthOf = (fork: TimelineFork, seen = new Set<string>()): number => {
            if (!fork.parentTimelineId || seen.has(fork.id)) return 1;
            seen.add(fork.id);
            const parent = byId.get(fork.parentTimelineId);
            return parent ? 1 + depthOf(parent, seen) : 1;
        };
        forks.forEach((fork, laneIndex) => {
            const lane: Lane = { id: `fork:${fork.id}`, label: fork.name, color: fork.color || this.palette[laneIndex % this.palette.length], explicitColor: !!fork.color, items: [], top: 0, height: 0, branchDepth: depthOf(fork) };
            const divergence = this.parseDate(fork.divergenceDate);
            main.filter(event => this.eventStart(event) <= divergence).forEach((event, index) => lane.items.push({ ...this.makeItem(event, index, lane, 0), forkId: fork.id, inherited: true }));
            events.filter(event => (fork.forkEvents || []).includes(this.eventKey(event))).forEach((event, index) => lane.items.push({ ...this.makeItem(event, index, lane, 0), forkId: fork.id }));
            lanes.push(lane);
        });
        return lanes;
    }

    private makeItem(event: Event, eventIndex: number, lane: Pick<Lane, 'id' | 'label' | 'color' | 'explicitColor'>, duplicateIndex: number): NativeItem {
        const rangeParts = event.dateTime?.split(/\s+(?:to|through|until)\s+/i) || [];
        const start = rangeParts[0] ? this.parseDate(rangeParts[0]) : NaN;
        const explicitEnd = rangeParts[1] ? this.parseDate(rangeParts[1]) : NaN;
        const end = Number.isFinite(explicitEnd) ? explicitEnd : (this.options.ganttMode && !event.isMilestone ? start + this.options.defaultGanttDuration * DAY_MS : start);
        // The event's own colour beats the lane's, and only a deliberately
        // chosen lane colour counts; a palette default must not displace the
        // milestone gold.
        const customColor = this.normalizeColor(event.color) || (lane.explicitColor ? lane.color : undefined);
        return { id: `${this.eventKey(event)}:${lane.id}:${duplicateIndex}`, event, eventIndex, start, end: Math.max(start, end), laneId: lane.id, laneLabel: lane.label, laneColor: lane.color, row: 0, approximate: this.isApproximate(event), customColor };
    }

    /** A usable colour string, or undefined when the value is blank or junk. */
    private normalizeColor(value: string | undefined): string | undefined {
        const trimmed = value?.trim();
        if (!trimmed) return undefined;
        return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(trimmed) ? trimmed : undefined;
    }

    /**
     * Whether the event's date was written loosely ("around 1420", "early
     * spring"). Drawn with a dashed outline so a guess does not read as a fact.
     */
    private isApproximate(event: Event): boolean {
        if (!event.dateTime) return false;
        const first = event.dateTime.split(/\s+(?:to|through|until)\s+/i)[0];
        return !!parseEventDate(first, { referenceDate: this.referenceDate }).approximate;
    }

    /**
     * Width the chip for this item will actually occupy when drawn.
     *
     * Layout and draw have to agree on this. Reserving a flat width for every
     * event while drawing a measured one is what lets a long label sit on top
     * of its neighbour, so both paths read the answer from here.
     */
    private chipWidth(ctx: CanvasRenderingContext2D, item: NativeItem, minimum: number): number {
        ctx.font = `11px ${this.css('--font-interface', 'sans-serif')}`;
        return Math.max(minimum, Math.min(MAX_CHIP_WIDTH, ctx.measureText(this.itemLabel(item)).width + 34));
    }

    /**
     * The text drawn on an item's chip.
     *
     * Prefixes carry the same signals the vis renderer put in the label: a
     * conflict marker, the narrative sequence number when reading in narrative
     * order, and flashback or flashforward flags.
     */
    private itemLabel(item: NativeItem): string {
        const event = item.event;
        const severity = this.conflictSeverity(event);
        const parts: string[] = [];
        if (severity === 'error') parts.push('!!');
        else if (severity === 'warning') parts.push('!');
        if (this.options.narrativeOrder && event.narrativeSequence !== undefined) {
            parts.push(`[${event.narrativeSequence}]`);
        }
        if (event.narrativeMarkers?.isFlashback) parts.push('FB');
        if (event.narrativeMarkers?.isFlashforward) parts.push('FF');
        parts.push(event.name || '(Untitled event)');
        return parts.join(' ');
    }

    /**
     * Left edge of an item's chip, in pixels.
     *
     * Row packing has to place chips using the same arithmetic that draws them,
     * including the clamp that keeps a chip on screen. Packing in time and
     * drawing in pixels is what let chips overlap even with stacking on: two
     * events far enough apart in time can still be clamped to the same place.
     */
    private chipLeft(item: NativeItem, chipWidth: number, width: number, chronology: boolean): number {
        const pointX = this.timeToX(item.start, width);
        // Deliberately unclamped. Pinning a chip to the viewport edge made it
        // slide along as you scrolled and then jump when its event finally came
        // back on screen. A chip belongs at its event's position and should
        // simply leave the view; the plot area is clipped so it does not spill
        // over the lane sidebar on the way out.
        if (chronology) return pointX + 9;
        const x2 = this.timeToX(item.end, width);
        return Math.abs(x2 - pointX) < 3 ? pointX - 7 : pointX;
    }

    private layoutRows(): void {
        const rowHeight = this.rowHeight();
        const width = this.root?.clientWidth || 900;
        const ctx = this.ctx;
        const axisHeight = this.axisHeight();
        const chronology = !this.options.ganttMode;
        const minimum = chronology ? MIN_CHRONOLOGY_CHIP_WIDTH : MIN_CHIP_WIDTH;
        let top = axisHeight;
        this.lanes.forEach(lane => {
            lane.items.sort((a, b) => a.start - b.start || a.end - b.end);

            // Running maximum of every end seen so far. Monotonic, so the draw
            // pass can binary search it for the first item that could still
            // reach into the viewport from the left.
            lane.maxEndPrefix = [];
            let runningMax = Number.NEGATIVE_INFINITY;
            for (const item of lane.items) {
                runningMax = Math.max(runningMax, item.end);
                lane.maxEndPrefix.push(runningMax);
            }

            // Packing runs in time, not in screen position, and covers every
            // item rather than only the visible ones. Both matter: a chip's
            // width in time is (width + gap) * pxToTime, which makes this exactly
            // equivalent to comparing pixels, but unlike pixels it does not move
            // when the view is panned. Packing what happens to be on screen made
            // the row count, and so the lane's height, change as you scrolled,
            // which shifted every lane below it mid-scroll.
            const pxToTime = (this.viewEnd - this.viewStart) / Math.max(1, width - SIDEBAR_WIDTH);
            const rowEnds: number[] = [];
            lane.items.forEach(item => {
                item.labelSuppressed = false;
                const chipWidth = ctx ? this.chipWidth(ctx, item, minimum) : MAX_CHIP_WIDTH;
                const reservation = (chipWidth + CHIP_GAP) * pxToTime;
                let row = 0;
                if (this.options.stackEnabled) while (row < rowEnds.length && rowEnds[row] > item.start) row++;
                item.row = row;
                rowEnds[row] = Math.max(item.end, item.start + reservation);
            });
            lane.top = top;
            // Chronology mode hangs its chips below the axis baseline, so the
            // lane has to reserve that offset on top of the rows themselves or
            // a tall stack runs past the bottom of its own lane.
            const chipOffset = chronology ? CHRONOLOGY_CHIP_TOP : 0;
            lane.height = Math.max(rowHeight + 12, chipOffset + rowEnds.length * rowHeight + 12);
            top += lane.height;
        });
        if (this.lanes.length === 1 && this.root) {
            this.lanes[0].height = Math.max(this.lanes[0].height, this.root.clientHeight - axisHeight);
            top = axisHeight + this.lanes[0].height;
        }
        const maxScroll = Math.max(0, top - (this.root?.clientHeight || 0));
        this.scrollTop = Math.min(this.scrollTop, maxScroll);
    }

    private groupTargets(event: Event): Array<{ id: string; label: string; color: string; explicitColor?: boolean }> {
        const mode = this.options.groupMode;
        if (mode === 'character') {
            // Resolve before de-duplicating, so an event referring to someone by
            // id and another by name land in the same lane.
            const resolved = event.characters?.length
                ? event.characters.map(value => this.resolveCharacterName(value))
                : ['No character'];
            const chars = Array.from(new Set(resolved));
            return chars.map(name => ({ id: `character:${name}`, label: name, color: this.colorFor(name) }));
        }
        if (mode === 'location') {
            const name = event.location ? this.resolveLocationName(event.location) : 'No location';
            return [{ id: `location:${name}`, label: name, color: this.colorFor(name) }];
        }
        if (mode === 'group') {
            const id = event.groups?.[0] || '__ungrouped__';
            const group = this.plugin.getGroups().find(candidate => candidate.id === id || candidate.name === id);
            return [{ id: `group:${id}`, label: group?.name || (id === '__ungrouped__' ? 'Ungrouped' : id), color: group?.color || this.colorFor(id), explicitColor: !!group?.color }];
        }
        if (mode === 'track') {
            const track = this.matchTrack(event);
            return [{ id: `track:${track?.id || '__unassigned__'}`, label: track?.name || 'Unassigned', color: track?.color || this.colorFor(track?.id || 'unassigned'), explicitColor: !!track?.color }];
        }
        return [{ id: '__timeline__', label: 'Timeline', color: this.css('--interactive-accent', '#7c3aed') }];
    }

    private matchTrack(event: Event): TimelineTrack | undefined {
        const tracks = (this.plugin.settings.timelineTracks || []).filter(track => track.visible !== false);
        const specific = tracks.find(track => {
            if (track.type === 'global') return false;
            if (track.type === 'character') return !!track.entityId && !!event.characters?.includes(track.entityId);
            if (track.type === 'location') return event.location === track.entityId;
            if (track.type === 'group') return !!track.entityId && !!event.groups?.includes(track.entityId);
            const criteria = track.filterCriteria;
            if (!criteria) return false;
            if (criteria.characters?.length && !criteria.characters.some(value => event.characters?.includes(value))) return false;
            if (criteria.locations?.length && (!event.location || !criteria.locations.includes(event.location))) return false;
            if (criteria.groups?.length && !criteria.groups.some(value => event.groups?.includes(value))) return false;
            if (criteria.tags?.length && !criteria.tags.some(value => event.tags?.includes(value))) return false;
            if (criteria.status?.length && (!event.status || !criteria.status.includes(event.status))) return false;
            return !criteria.milestonesOnly || !!event.isMilestone;
        });
        return specific || tracks.find(track => track.type === 'global');
    }

    private scheduleDraw(): void {
        if (this.frame) return;
        this.frame = (this.container.ownerDocument.defaultView || window).requestAnimationFrame(() => {
            this.frame = 0;
            this.draw();
            this.options.onViewChange?.();
        });
    }

    private draw(): void {
        if (!this.canvas || !this.ctx || !this.root) return;
        this.layoutRows();
        const ctx = this.ctx;
        const width = this.root.clientWidth;
        const height = this.root.clientHeight;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = this.css('--background-primary', '#111827');
        ctx.fillRect(0, 0, width, height);
        // Reset before the orientation split: both layouts fill these, and the
        // vertical branch returns early.
        this.visibleItems = [];
        this.markerHits = [];
        this.slotTimes = this.computeSlotTimes();
        if (!this.options.ganttMode && this.options.timelineOrientation === 'vertical') {
            this.drawVerticalTimeline(ctx, width, height);
            return;
        }
        this.drawAxis(ctx, width, height);
        this.drawHorizontalCalendarLayers(ctx, width);
        this.drawEras(ctx, width, height);
        this.lanes.forEach(lane => this.drawLane(ctx, lane, width, height));
        this.drawForkBranches(ctx, width, height);
        this.drawConnectors(ctx, width, height);
        this.drawNow(ctx, width, height);
    }

    private drawAxis(ctx: CanvasRenderingContext2D, width: number, _height: number): void {
        const axisHeight = this.axisHeight();
        ctx.fillStyle = this.css('--background-secondary', '#1f2937');
        ctx.fillRect(0, 0, width, axisHeight);
        ctx.fillStyle = this.css('--text-muted', '#9ca3af');
        ctx.font = `12px ${this.css('--font-interface', 'sans-serif')}`;
        const plotWidth = Math.max(1, width - SIDEBAR_WIDTH);
        const span = this.viewEnd - this.viewStart;
        const calendar = this.calendarRegistry.getActiveCalendar();
        if (calendar.id !== GREGORIAN_CALENDAR.id) {
            const startDay = this.viewStart / DAY_MS + this.unixEpochAbsoluteDay();
            const endDay = this.viewEnd / DAY_MS + this.unixEpochAbsoluteDay();
            const ticks = generateTicks(calendar, { startDay, endDay, widthPx: plotWidth }, Math.max(2, Math.floor(plotWidth / 120)));
            ctx.strokeStyle = this.css('--background-modifier-border', '#374151');
            ticks.forEach(tick => {
                const x = SIDEBAR_WIDTH + tick.x;
                ctx.beginPath(); ctx.moveTo(x, axisHeight); ctx.lineTo(x, this.root?.clientHeight || 0); ctx.stroke();
                ctx.fillText(tick.label, x + 5, 25);
            });
            ctx.strokeRect(0, 0, width, axisHeight);
            return;
        }
        const desired = Math.max(2, Math.floor(plotWidth / 120));
        const rawStep = span / desired;
        const step = this.niceTimeStep(rawStep);
        const first = Math.ceil(this.viewStart / step) * step;
        ctx.strokeStyle = this.css('--background-modifier-border', '#374151');
        ctx.lineWidth = 1;
        for (let time = first; time < this.viewEnd; time += step) {
            const x = this.timeToX(time, width);
            ctx.beginPath(); ctx.moveTo(x, axisHeight); ctx.lineTo(x, this.root?.clientHeight || 0); ctx.stroke();
            ctx.fillText(this.formatTick(time, step), x + 5, 25);
        }
        ctx.strokeRect(0, 0, width, axisHeight);
    }

    private axisHeight(): number {
        if (!this.options.ganttMode && this.options.timelineOrientation === 'vertical') return BASE_AXIS_HEIGHT;
        const rows = this.calendarLayerRows();
        return BASE_AXIS_HEIGHT + rows * CALENDAR_BAND_HEIGHT;
    }

    private calendarLayerRows(): number {
        const calendar = this.calendarRegistry.getActiveCalendar();
        const theme = this.calendarRegistry.getActiveTheme().axis;
        const spanDays = (this.viewEnd - this.viewStart) / DAY_MS;
        if (spanDays > normalYearLength(calendar) * 8) return 0;
        const cycleRows = theme?.showCycles === false ? 0 : Math.min(2, calendar.cycles?.length || 0);
        const holidayRows = theme?.showHolidays === false || !calendar.holidays?.length ? 0 : 1;
        return cycleRows + holidayRows;
    }

    private calendarBands(calendar: CalendarSystem, absoluteStart: number, absoluteEnd: number): CalendarBand[] {
        const rows = this.calendarLayerRows();
        if (!rows) return [];
        const theme = this.calendarRegistry.getActiveTheme().axis;
        const cycles = theme?.showCycles === false ? [] : (calendar.cycles || []).slice(0, 2);
        const includeHolidays = theme?.showHolidays !== false && !!calendar.holidays?.length;
        const firstYear = fromAbsolute(calendar, { absoluteDay: absoluteStart }).year - 1;
        const lastYear = fromAbsolute(calendar, { absoluteDay: absoluteEnd }).year + 1;
        const bands: CalendarBand[] = [];
        for (let year = firstYear; year <= lastYear && year < firstYear + 14; year++) {
            const yearStart = toAbsolute(calendar, { year, month: 0, day: 1 }).absoluteDay;
            const yearDays = daysInYear(calendar, year);
            cycles.forEach((cycle, row) => {
                const entries = [...cycle.entries].sort((a, b) => a.startDayOfYear - b.startDayOfYear);
                entries.forEach((entry, index) => {
                    const startDay = yearStart + Math.max(0, entry.startDayOfYear);
                    const endDay = yearStart + Math.min(yearDays, entries[index + 1]?.startDayOfYear ?? yearDays);
                    if (endDay <= absoluteStart || startDay >= absoluteEnd || endDay <= startDay) return;
                    bands.push({
                        startDay,
                        endDay,
                        label: entry.name,
                        group: cycle.name,
                        color: cycle.color || this.palette[row % this.palette.length],
                        row,
                        kind: 'cycle',
                    });
                });
            });
            if (includeHolidays) {
                const yearMonths = monthsInYear(calendar, year);
                for (const holiday of calendar.holidays || []) {
                    const baseMonth = calendar.months[holiday.month];
                    const month = baseMonth ? yearMonths.findIndex(candidate => candidate.name === baseMonth.name) : -1;
                    if (month < 0 || holiday.day > yearMonths[month].days) continue;
                    const startDay = toAbsolute(calendar, { year, month, day: holiday.day }).absoluteDay;
                    const endDay = startDay + Math.max(1, holiday.length || 1);
                    if (endDay <= absoluteStart || startDay >= absoluteEnd) continue;
                    bands.push({
                        startDay,
                        endDay,
                        label: holiday.name,
                        group: 'Holidays',
                        color: holiday.color || '#f59e0b',
                        row: cycles.length,
                        kind: 'holiday',
                    });
                }
            }
        }
        return bands;
    }

    private drawHorizontalCalendarLayers(ctx: CanvasRenderingContext2D, width: number): void {
        const calendar = this.calendarRegistry.getActiveCalendar();
        const absoluteStart = this.viewStart / DAY_MS + this.unixEpochAbsoluteDay();
        const absoluteEnd = this.viewEnd / DAY_MS + this.unixEpochAbsoluteDay();
        const bands = this.calendarBands(calendar, absoluteStart, absoluteEnd);
        if (!bands.length) return;
        ctx.save();
        ctx.font = `10px ${this.css('--font-interface', 'sans-serif')}`;
        const groups = new Map<number, string>();
        bands.forEach(band => {
            groups.set(band.row, band.group);
            const x1 = Math.max(SIDEBAR_WIDTH, this.timeToX((band.startDay - this.unixEpochAbsoluteDay()) * DAY_MS, width));
            const x2 = Math.min(width, this.timeToX((band.endDay - this.unixEpochAbsoluteDay()) * DAY_MS, width));
            const y = BASE_AXIS_HEIGHT + band.row * CALENDAR_BAND_HEIGHT;
            if (x2 <= x1) return;
            ctx.globalAlpha = band.kind === 'holiday' ? 0.34 : 0.22;
            ctx.fillStyle = band.color;
            ctx.fillRect(x1, y, x2 - x1, CALENDAR_BAND_HEIGHT - 1);
            ctx.globalAlpha = 0.95;
            ctx.fillStyle = this.css('--text-normal', '#e5e7eb');
            if (x2 - x1 > 34) ctx.fillText(this.truncate(ctx, band.label, x2 - x1 - 8), x1 + 4, y + 11);
        });
        ctx.globalAlpha = 1;
        ctx.fillStyle = this.css('--background-secondary-alt', '#18202d');
        ctx.fillRect(0, BASE_AXIS_HEIGHT, SIDEBAR_WIDTH, this.axisHeight() - BASE_AXIS_HEIGHT);
        ctx.fillStyle = this.css('--text-muted', '#9ca3af');
        groups.forEach((label, row) => ctx.fillText(this.truncate(ctx, label.toUpperCase(), SIDEBAR_WIDTH - 18), 9, BASE_AXIS_HEIGHT + row * CALENDAR_BAND_HEIGHT + 11));
        ctx.restore();
    }

    private drawLane(ctx: CanvasRenderingContext2D, lane: Lane, width: number, height: number): void {
        if (!this.options.ganttMode) {
            this.drawChronologyLane(ctx, lane, width, height);
            return;
        }
        const top = lane.top - this.scrollTop;
        if (top > height || top + lane.height < this.axisHeight()) return;
        ctx.fillStyle = this.css('--background-secondary-alt', '#18202d');
        ctx.fillRect(0, top, SIDEBAR_WIDTH, lane.height);
        // The lane name takes the lane's colour, so a row in the sidebar can be
        // matched to its markers out on the timeline without counting rows.
        ctx.fillStyle = lane.color;
        ctx.font = `600 12px ${this.css('--font-interface', 'sans-serif')}`;
        ctx.fillText(this.truncate(ctx, lane.label, SIDEBAR_WIDTH - 24), 13, top + 22);
        ctx.strokeStyle = this.css('--background-modifier-border', '#374151');
        ctx.beginPath(); ctx.moveTo(0, top + lane.height); ctx.lineTo(width, top + lane.height); ctx.stroke();
        const rowHeight = this.rowHeight();
        const leftTime = this.viewStart;
        const rightTime = this.viewEnd;
        // Items sit at their true position now, so anything leaving the view has
        // to be clipped rather than pinned, or it would paint over the sidebar.
        ctx.save();
        ctx.beginPath();
        ctx.rect(SIDEBAR_WIDTH, this.axisHeight(), Math.max(0, width - SIDEBAR_WIDTH), height);
        ctx.clip();
        const startIndex = this.firstVisible(lane, leftTime);
        for (let i = startIndex; i < lane.items.length; i++) {
            const item = lane.items[i];
            if (item.start > rightTime) break;
            if (item.end < leftTime) continue;
            const x1 = this.timeToX(item.start, width);
            const x2 = this.timeToX(item.end, width);
            const y = top + 7 + item.row * rowHeight;
            const itemHeight = rowHeight - 7;
            const isPoint = Math.abs(x2 - x1) < 3;
            const chipWidth = this.chipWidth(ctx, item, MIN_CHIP_WIDTH);
            const itemWidth = isPoint ? chipWidth : Math.max(24, x2 - x1);
            const x = isPoint ? x1 - 7 : x1;
            item.rect = new DOMRect(x, y, itemWidth, itemHeight);
            this.visibleItems.push(item);
            this.drawItem(ctx, item, isPoint);
        }
        ctx.restore();
    }

    private drawChronologyLane(ctx: CanvasRenderingContext2D, lane: Lane, width: number, height: number): void {
        const top = lane.top - this.scrollTop;
        if (top > height || top + lane.height < this.axisHeight()) return;
        ctx.fillStyle = this.css('--background-secondary-alt', '#18202d');
        ctx.fillRect(0, top, SIDEBAR_WIDTH, lane.height);
        // The lane name takes the lane's colour, so a row in the sidebar can be
        // matched to its markers out on the timeline without counting rows.
        ctx.fillStyle = lane.color;
        ctx.font = `600 12px ${this.css('--font-interface', 'sans-serif')}`;
        ctx.fillText(this.truncate(ctx, lane.label, SIDEBAR_WIDTH - 24), 13, top + 22);

        const baselineY = top + 18;
        ctx.strokeStyle = this.css('--background-modifier-border', '#374151');
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(SIDEBAR_WIDTH, baselineY); ctx.lineTo(width, baselineY); ctx.stroke();

        const rowHeight = this.rowHeight();
        // Right edge of the last chip drawn on each row, so a chip that would
        // land on top of its neighbour can stand down.
        const rowRightEdges: number[] = [];
        // Chips sit at their true position, so ones leaving the view are clipped
        // to the plot area rather than pinned to its edge.
        ctx.save();
        ctx.beginPath();
        ctx.rect(SIDEBAR_WIDTH, this.axisHeight(), Math.max(0, width - SIDEBAR_WIDTH), height);
        ctx.clip();
        this.drawSlots(ctx, baselineY, width);
        const startIndex = this.firstVisible(lane, this.viewStart);
        for (let i = startIndex; i < lane.items.length; i++) {
            const item = lane.items[i];
            if (item.start > this.viewEnd) break;
            if (item.end < this.viewStart) continue;
            const pointX = this.timeToX(item.start, width);
            const endX = this.timeToX(item.end, width);
            const chipY = top + CHRONOLOGY_CHIP_TOP + item.row * rowHeight;
            const chipWidth = this.chipWidth(ctx, item, MIN_CHRONOLOGY_CHIP_WIDTH);
            const chipHeight = rowHeight - 7;
            const chipX = this.chipLeft(item, chipWidth, width, true);

            // With stacking on, layoutRows has already given every visible item
            // a row it fits in, so nothing needs to stand down. Only the
            // deliberately single-row case can still collide, and there the
            // later chip drops to its axis marker rather than printing over its
            // neighbour.
            const rowRight = rowRightEdges[item.row];
            const collides = !this.options.stackEnabled
                && rowRight !== undefined
                && chipX < rowRight + CHIP_GAP;
            item.labelSuppressed = collides;

            // Hit target follows what was drawn. A suppressed item answers to
            // its marker, so it stays clickable without claiming empty space
            // where its chip would have been.
            item.rect = collides
                ? new DOMRect(pointX - 7, baselineY - 7, 14, 14)
                : new DOMRect(chipX, chipY, chipWidth, chipHeight);
            this.visibleItems.push(item);
            // The marker is the drag handle. Unlike the chip it sits at the
            // event's true instant and never moves between rows, so it stays
            // where the pointer expects it.
            if (this.slotsVisible() && this.isDraggable(item)) this.markerHits.push({ item, x: pointX, y: baselineY });

            if (collides) {
                this.drawPointMarker(ctx, pointX, baselineY, item);
                continue;
            }
            rowRightEdges[item.row] = chipX + chipWidth;

            ctx.strokeStyle = item.laneColor;
            ctx.globalAlpha = item.inherited ? 0.45 : 0.8;
            ctx.lineWidth = 1;
            // Stem: down from the axis marker, then across to the chip. The
            // elbow is what will carry branch lines once forks hang off it.
            ctx.beginPath(); ctx.moveTo(pointX, baselineY); ctx.lineTo(pointX, chipY + chipHeight / 2); ctx.lineTo(chipX, chipY + chipHeight / 2); ctx.stroke();
            if (endX - pointX > 3) {
                ctx.beginPath(); ctx.moveTo(pointX, baselineY); ctx.lineTo(endX, baselineY); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(endX, baselineY - 4); ctx.lineTo(endX, baselineY + 4); ctx.stroke();
            }
            ctx.globalAlpha = 1;
            this.drawPointMarker(ctx, pointX, baselineY, item);
            this.drawItem(ctx, item, true, undefined, false);
        }
        this.drawDropTarget(ctx, lane, baselineY, width, height);
        ctx.restore();
    }

    private drawVerticalTimeline(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        const top = 38;
        const bottom = Math.max(top + 1, height - 24);
        const alternateSides = width >= 620;
        const axisX = alternateSides ? width / 2 : Math.min(112, Math.max(82, width * 0.28));
        const calendar = this.calendarRegistry.getActiveCalendar();
        const absoluteStart = this.viewStart / DAY_MS + this.unixEpochAbsoluteDay();
        const absoluteEnd = this.viewEnd / DAY_MS + this.unixEpochAbsoluteDay();

        this.drawVerticalEras(ctx, absoluteStart, absoluteEnd, top, bottom, width);
        this.drawVerticalCalendarLayers(ctx, calendar, absoluteStart, absoluteEnd, top, bottom, width);
        this.drawVerticalCalendarPeriods(ctx, calendar, absoluteStart, absoluteEnd, axisX, top, bottom, width);
        ctx.strokeStyle = this.css('--background-modifier-border', '#374151');
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(axisX, top); ctx.lineTo(axisX, bottom); ctx.stroke();
        ctx.fillStyle = this.css('--text-muted', '#9ca3af');
        ctx.font = `12px ${this.css('--font-interface', 'sans-serif')}`;

        const ticks = generateTicks(calendar, { startDay: absoluteStart, endDay: absoluteEnd, widthPx: bottom - top }, Math.max(4, Math.floor((bottom - top) / 90)));
        ticks.forEach(tick => {
            const time = (tick.absoluteDay - this.unixEpochAbsoluteDay()) * DAY_MS;
            const ratio = (time - this.viewStart) / (this.viewEnd - this.viewStart);
            const y = top + ratio * (bottom - top);
            ctx.beginPath(); ctx.moveTo(axisX - 5, y); ctx.lineTo(axisX + 5, y); ctx.stroke();
            if (!alternateSides) ctx.fillText(tick.label, axisX - ctx.measureText(tick.label).width - 10, y + 4);
        });

        const timeToY = (time: number) => top + (time - this.viewStart) / (this.viewEnd - this.viewStart) * (bottom - top);
        this.drawVerticalSlots(ctx, axisX, top, bottom, timeToY);

        // Intersection, not containment: an event that began before the window
        // but runs into it is still on screen and must not be dropped.
        const items = this.lanes.flatMap(lane => lane.items).filter(item => item.end >= this.viewStart && item.start <= this.viewEnd).sort((a, b) => a.start - b.start);
        this.visibleItems = [];
        const placements = items.map((item, index) => {
            const desiredY = top + (item.start - this.viewStart) / (this.viewEnd - this.viewStart) * (bottom - top);
            return { item, desiredY, placedY: desiredY, rightSide: !alternateSides || index % 2 === 0 };
        });
        [true, false].forEach(rightSide => {
            const side = placements.filter(placement => placement.rightSide === rightSide);
            if (!side.length) return;
            const gap = Math.max(40, Math.min(58, (bottom - top) / Math.max(1, side.length - 1)));
            side.forEach((placement, index) => {
                placement.placedY = index === 0 ? Math.max(top, placement.desiredY) : Math.max(placement.desiredY, side[index - 1].placedY + gap);
            });
            if (side[side.length - 1].placedY > bottom) {
                side[side.length - 1].placedY = bottom;
                for (let i = side.length - 2; i >= 0; i--) side[i].placedY = Math.min(side[i].placedY, side[i + 1].placedY - gap);
            }
        });

        placements.forEach(({ item, desiredY, placedY, rightSide }) => {
            const availableWidth = rightSide ? width - axisX - 38 : axisX - 38;
            const chipWidth = Math.max(130, Math.min(260, availableWidth));
            const chipHeight = 42;
            const chipX = rightSide ? axisX + 28 : Math.max(4, axisX - 28 - chipWidth);
            const chipY = placedY - chipHeight / 2;
            item.rect = new DOMRect(chipX, chipY, chipWidth, chipHeight);
            this.visibleItems.push(item);
            ctx.strokeStyle = item.laneColor;
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(axisX, desiredY); ctx.lineTo(rightSide ? chipX : chipX + chipWidth, placedY); ctx.stroke();
            // The marker sits at desiredY, the event's true instant, not at
            // placedY where collision avoidance pushed its card.
            if (this.slotsVisible() && this.isDraggable(item)) this.markerHits.push({ item, x: axisX, y: desiredY });
            this.drawPointMarker(ctx, axisX, desiredY, item);
            this.drawVerticalEventCard(ctx, item, calendar);
        });
        this.drawVerticalDropTarget(ctx, axisX, width, timeToY);
        this.drawConnectors(ctx, width, height);
        this.drawNowVertical(ctx, axisX, top, bottom);
    }

    private drawVerticalCalendarPeriods(ctx: CanvasRenderingContext2D, calendar: ReturnType<CalendarRegistry['getActiveCalendar']>, absoluteStart: number, absoluteEnd: number, axisX: number, top: number, bottom: number, width: number): void {
        const spanDays = absoluteEnd - absoluteStart;
        const useYears = spanDays > normalYearLength(calendar) * 4;
        const startDate = fromAbsolute(calendar, { absoluteDay: absoluteStart });
        const periods: Array<{ day: number; label: string }> = [];
        let year = startDate.year;
        let month = useYears ? 0 : startDate.month;
        for (let count = 0; count < 80; count++) {
            const day = toAbsolute(calendar, { year, month, day: 1 }).absoluteDay;
            const yearMonths = monthsInYear(calendar, year);
            const monthName = yearMonths[month]?.name || `Month ${month + 1}`;
            periods.push({ day, label: useYears ? this.calendarYearLabel(calendar, year) : `${monthName} ${this.calendarYearLabel(calendar, year)}` });
            if (useYears) year++;
            else if (++month >= yearMonths.length) { month = 0; year++; }
            if (day > absoluteEnd) break;
        }
        if (!periods.length) return;
        const current = periods[0];
        current.day = absoluteStart;
        periods.filter(period => period.day >= absoluteStart && period.day < absoluteEnd).forEach((period, index) => {
            const y = top + (period.day - absoluteStart) / spanDays * (bottom - top);
            ctx.save();
            ctx.strokeStyle = this.css('--background-modifier-border-hover', '#4b5563');
            ctx.globalAlpha = index === 0 ? 0.9 : 0.55;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(4, y); ctx.lineTo(width - 4, y); ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillStyle = this.css('--background-primary', '#111827');
            const labelWidth = Math.min(150, Math.max(86, axisX - 18));
            this.roundedRect(ctx, 6, Math.max(4, y - 13), labelWidth, 22, 3); ctx.fill();
            ctx.fillStyle = this.css('--text-accent', '#a78bfa');
            ctx.font = `600 11px ${this.css('--font-interface', 'sans-serif')}`;
            ctx.fillText(this.truncate(ctx, period.label.toUpperCase(), labelWidth - 12), 12, Math.max(19, y + 2));
            ctx.restore();
        });
    }

    private drawVerticalCalendarLayers(
        ctx: CanvasRenderingContext2D,
        calendar: CalendarSystem,
        absoluteStart: number,
        absoluteEnd: number,
        top: number,
        bottom: number,
        width: number,
    ): void {
        const span = absoluteEnd - absoluteStart;
        const bands = this.calendarBands(calendar, absoluteStart, absoluteEnd);
        if (!bands.length) return;
        ctx.save();
        ctx.font = `600 9px ${this.css('--font-interface', 'sans-serif')}`;
        bands.forEach(band => {
            const y1 = top + (Math.max(absoluteStart, band.startDay) - absoluteStart) / span * (bottom - top);
            const y2 = top + (Math.min(absoluteEnd, band.endDay) - absoluteStart) / span * (bottom - top);
            if (y2 <= y1) return;
            ctx.globalAlpha = band.kind === 'holiday' ? 0.12 : band.row === 0 ? 0.055 : 0.035;
            ctx.fillStyle = band.color;
            ctx.fillRect(0, y1, width, Math.max(1, y2 - y1));
            if (y2 - y1 >= 11 && band.row === 0) {
                ctx.globalAlpha = 0.72;
                ctx.fillStyle = band.color;
                const label = this.truncate(ctx, band.label.toUpperCase(), 126);
                ctx.fillText(label, Math.max(8, width - ctx.measureText(label).width - 10), y1 + 10);
            }
        });
        ctx.restore();
    }

    private drawVerticalEras(ctx: CanvasRenderingContext2D, absoluteStart: number, absoluteEnd: number, top: number, bottom: number, width: number): void {
        if (!this.options.showEras) return;
        const span = absoluteEnd - absoluteStart;
        (this.plugin.settings.timelineEras || []).filter(era => era.visible !== false).forEach(era => {
            const start = this.parseDate(era.startDate) / DAY_MS + this.unixEpochAbsoluteDay();
            const end = this.parseDate(era.endDate) / DAY_MS + this.unixEpochAbsoluteDay();
            if (!Number.isFinite(start) || !Number.isFinite(end) || end < absoluteStart || start > absoluteEnd) return;
            const y1 = top + (Math.max(start, absoluteStart) - absoluteStart) / span * (bottom - top);
            const y2 = top + (Math.min(end, absoluteEnd) - absoluteStart) / span * (bottom - top);
            ctx.save();
            ctx.globalAlpha = 0.09;
            ctx.fillStyle = era.color || '#8b5cf6';
            ctx.fillRect(0, y1, width, Math.max(2, y2 - y1));
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = era.color || this.css('--text-accent', '#a78bfa');
            ctx.font = `600 10px ${this.css('--font-interface', 'sans-serif')}`;
            const label = era.name.toUpperCase();
            ctx.fillText(this.truncate(ctx, label, 150), Math.max(8, width - Math.min(160, ctx.measureText(label).width + 10)), Math.min(bottom - 5, y1 + 14));
            ctx.restore();
        });
    }

    private drawVerticalEventCard(ctx: CanvasRenderingContext2D, item: NativeItem, calendar: ReturnType<CalendarRegistry['getActiveCalendar']>): void {
        const rect = item.rect!;
        const accent = item === this.selected ? this.css('--interactive-accent', '#8b5cf6') : item.laneColor;
        const markers = `${item.event.narrativeMarkers?.isFlashback ? 'FB ' : ''}${item.event.narrativeMarkers?.isFlashforward ? 'FF ' : ''}`;
        const title = `${markers}${item.event.name}`;
        const dateLabel = this.verticalEventDate(item.start, calendar);
        const meta = this.lanes.length > 1 ? item.laneLabel : (item.event.status || (item.event.isMilestone ? 'Milestone' : 'Event'));
        ctx.save();
        ctx.globalAlpha = item.inherited ? 0.45 : 1;
        ctx.fillStyle = this.css('--background-secondary', '#1f2937');
        this.roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 4); ctx.fill();
        ctx.strokeStyle = item === this.selected ? accent : this.css('--background-modifier-border', '#374151');
        ctx.lineWidth = item === this.selected ? 2 : 1; ctx.stroke();
        ctx.fillStyle = this.css('--text-normal', '#e5e7eb');
        ctx.font = `600 11px ${this.css('--font-interface', 'sans-serif')}`;
        ctx.fillText(this.truncate(ctx, title, rect.width - 18), rect.x + 10, rect.y + 16);
        ctx.fillStyle = this.css('--text-muted', '#9ca3af');
        ctx.font = `10px ${this.css('--font-interface', 'sans-serif')}`;
        const detail = `${dateLabel}  ·  ${meta}`;
        ctx.fillText(this.truncate(ctx, detail, rect.width - 18), rect.x + 10, rect.y + 32);
        ctx.restore();
    }

    private verticalEventDate(time: number, calendar: ReturnType<CalendarRegistry['getActiveCalendar']>): string {
        const absoluteDay = time / DAY_MS + this.unixEpochAbsoluteDay();
        const date = fromAbsolute(calendar, { absoluteDay });
        const month = monthsInYear(calendar, date.year)[date.month]?.name || `Month ${date.month + 1}`;
        let label = `${month} ${date.day}, ${this.calendarYearLabel(calendar, date.year)}`;
        if ((date.unitOfDay || 0) > 0 && calendar.unitsPerDay === 1440) {
            const units = Math.round(date.unitOfDay || 0);
            label += ` ${String(Math.floor(units / 60)).padStart(2, '0')}:${String(units % 60).padStart(2, '0')}`;
        }
        return label;
    }

    private calendarYearLabel(calendar: ReturnType<CalendarRegistry['getActiveCalendar']>, year: number): string {
        return calendar.epochLabel ? `${year} ${calendar.epochLabel}` : String(year);
    }

    /**
     * @param withMarker draw the marker inside the chip. False in chronology
     * mode, where the same event already has a marker on the axis and drawing a
     * second one gives every milestone two stars.
     */
    private drawItem(ctx: CanvasRenderingContext2D, item: NativeItem, isPoint: boolean, labelOverride?: string, withMarker = true): void {
        const rect = item.rect!;
        ctx.save();
        ctx.globalAlpha = item.inherited ? 0.45 : 1;
        const accent = item.customColor
            || (item === this.selected ? this.css('--interactive-accent', '#8b5cf6') : item.laneColor);
        if (isPoint) {
            ctx.fillStyle = this.css('--background-secondary', '#1f2937');
            this.roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 3);
            ctx.fill();
            ctx.strokeStyle = item === this.selected ? this.css('--interactive-accent', '#8b5cf6') : this.css('--background-modifier-border', '#374151');
            ctx.lineWidth = item === this.selected ? 2 : 1;
            if (item.approximate) ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
            if (withMarker) {
                ctx.fillStyle = this.markerColor(item);
                const markerX = rect.x + 10;
                const markerY = rect.y + rect.height / 2;
                if (item.event.isMilestone) {
                    this.starPath(ctx, markerX, markerY, 6.5);
                    ctx.fill();
                    if (!item.customColor) {
                        ctx.strokeStyle = this.css('--sts-timeline-milestone-edge', MILESTONE_GOLD_EDGE);
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    }
                } else {
                    ctx.beginPath();
                    ctx.arc(markerX, markerY, 4, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        } else {
            ctx.fillStyle = accent;
            this.roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 3); ctx.fill();
            if (item.approximate) {
                ctx.strokeStyle = this.css('--background-primary', '#111827');
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                this.roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 3);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            if (this.options.showProgressBars && typeof item.event.progress === 'number') {
                ctx.fillStyle = this.css('--text-on-accent', '#fff');
                ctx.globalAlpha = 0.3;
                ctx.fillRect(rect.x, rect.y + rect.height - 3, rect.width * Math.max(0, Math.min(1, item.event.progress / 100)), 3);
            }
        }
        ctx.globalAlpha = 1;
        const markerInset = isPoint && withMarker;
        const labelX = markerInset ? rect.x + 22 : rect.x + 6;
        const available = markerInset ? Math.max(0, rect.width - 28) : Math.max(0, rect.width - 12);
        if (available > 18) {
            const severity = this.conflictSeverity(item.event);
            ctx.fillStyle = severity === 'error'
                ? this.css('--color-red', '#ef4444')
                : severity === 'warning'
                    ? this.css('--color-yellow', '#eab308')
                    : isPoint ? this.css('--text-normal', '#e5e7eb') : this.css('--text-on-accent', '#fff');
            ctx.font = `11px ${this.css('--font-interface', 'sans-serif')}`;
            ctx.fillText(this.truncate(ctx, labelOverride || this.itemLabel(item), available), labelX, rect.y + rect.height / 2 + 4);
        }
        ctx.restore();
    }

    /**
     * Five-pointed star, drawn centred on (x, y).
     *
     * Milestones read as stars rather than diamonds. The vis-timeline renderer
     * this replaced marked them with a literal ★ in the label, so this keeps the
     * meaning people already learned while drawing it as a shape.
     */
    private starPath(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
        const inner = radius * 0.42;
        ctx.beginPath();
        for (let point = 0; point < 10; point++) {
            const distance = point % 2 === 0 ? radius : inner;
            // Start at twelve o'clock so the star sits upright.
            const angle = -Math.PI / 2 + point * Math.PI / 5;
            const px = x + Math.cos(angle) * distance;
            const py = y + Math.sin(angle) * distance;
            if (point === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
    }

    /**
     * Colour for an item's axis marker.
     *
     * Milestones are always gold. That is the whole point of the star: it should
     * be findable at a glance without first working out which lane it belongs
     * to, so it keeps its colour even when the lane has one of its own.
     * Selection still reads through the chip border.
     */
    private markerColor(item: NativeItem): string {
        if (item.customColor) return item.customColor;
        if (item.event.isMilestone) return this.css('--sts-timeline-milestone', MILESTONE_GOLD);
        return item === this.selected ? this.css('--interactive-accent', '#8b5cf6') : item.laneColor;
    }

    /**
     * Slots are the dates an event can be dropped on. They are only offered
     * while editing, in the chronology layout, since the gantt bars have no
     * single point to sit on and the vertical layout has no baseline to sit
     * along.
     */
    /**
     * Whether dragging this item can be written back honestly.
     *
     * Scenes and watched notes are not events — `saveEvent` would write them
     * out as new event notes, which is why `openAt` refuses them too. An
     * approximate date ("around 1420") parses to a real instant but writing it
     * back would silently replace the author's vagueness with a false
     * precision, so it gets no handle rather than a lossy one.
     */
    private isDraggable(item: NativeItem): boolean {
        if (item.approximate || !Number.isFinite(item.start)) return false;
        const tags = item.event.tags;
        return !tags?.includes('scene') && !tags?.includes('watched-note');
    }

    /** The axis marker under the pointer, nearest first. */
    private markerAt(x: number, y: number): NativeItem | null {
        let best: NativeItem | null = null;
        let bestDistance = MARKER_GRAB_RADIUS;
        this.markerHits.forEach(hit => {
            const distance = Math.hypot(hit.x - x, hit.y - y);
            if (distance <= bestDistance) { bestDistance = distance; best = hit.item; }
        });
        return best;
    }

    private slotsVisible(): boolean {
        return Boolean(this.options.editMode) && !this.options.ganttMode;
    }

    private computeSlotTimes(): number[] {
        if (!this.slotsVisible()) return [];
        const epoch = this.unixEpochAbsoluteDay();
        return snapSlots(this.calendarRegistry.getActiveCalendar(), this.axisView())
            .map(day => (day - epoch) * DAY_MS);
    }

    /**
     * Empty slots along the lane baseline: the same dot an event marker uses,
     * hollow and unfilled, so an event and the place it could go read as one
     * visual system rather than two.
     *
     * Drawn before the items so a marker simply paints over the slot it sits
     * on. Nothing needs to be skipped, and an event whose date is *not* on a
     * boundary correctly shows both — its marker plus the nearby slot it does
     * not occupy.
     */
    private drawSlots(ctx: CanvasRenderingContext2D, baselineY: number, width: number): void {
        if (!this.slotTimes.length) return;
        ctx.save();
        ctx.strokeStyle = this.css('--sts-timeline-slot', SLOT_COLOR);
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.55;
        this.slotTimes.forEach(time => {
            const x = this.timeToX(time, width);
            if (x < SIDEBAR_WIDTH || x > width) return;
            ctx.beginPath();
            ctx.arc(x, baselineY, SLOT_RADIUS, 0, Math.PI * 2);
            ctx.stroke();
        });
        ctx.restore();
    }

    /**
     * The slot a marker drag is currently over, plus a guide down to the chips
     * and the date it would be written as. Only drawn for the lane holding the
     * dragged item.
     */
    private drawDropTarget(ctx: CanvasRenderingContext2D, lane: Lane, baselineY: number, width: number, height: number): void {
        const dragging = this.dragging;
        if (!dragging || dragging.kind !== 'marker' || !dragging.item) return;
        if (dragging.item.laneId !== lane.id || this.dragGhost === null) return;
        const x = this.timeToX(this.dragGhost, width);
        const accent = this.css('--interactive-accent', '#7c3aed');

        ctx.save();
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.35;
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(x, baselineY); ctx.lineTo(x, height); ctx.stroke();
        ctx.setLineDash([]);

        ctx.globalAlpha = 1;
        ctx.fillStyle = accent;
        ctx.beginPath(); ctx.arc(x, baselineY, SLOT_RADIUS + 2.5, 0, Math.PI * 2); ctx.fill();

        // Below the baseline, not above: the plot is clipped at the axis, so a
        // label over the first lane's baseline would be sliced off.
        const label = this.formatEditDate(this.dragGhost);
        ctx.font = `600 11px ${this.css('--font-interface', 'sans-serif')}`;
        const textWidth = ctx.measureText(label).width;
        const boxX = Math.min(width - textWidth - 12, x + 9);
        ctx.fillStyle = this.css('--background-secondary', '#1f2937');
        ctx.fillRect(boxX, baselineY + 3, textWidth + 8, 16);
        ctx.fillStyle = this.css('--text-normal', '#e5e7eb');
        ctx.fillText(label, boxX + 4, baselineY + 15);
        ctx.restore();
    }

    /** Empty date slots down the vertical axis. */
    private drawVerticalSlots(ctx: CanvasRenderingContext2D, axisX: number, top: number, bottom: number, timeToY: (time: number) => number): void {
        if (!this.slotTimes.length) return;
        ctx.save();
        ctx.strokeStyle = this.css('--sts-timeline-slot', SLOT_COLOR);
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.55;
        this.slotTimes.forEach(time => {
            const y = timeToY(time);
            if (y < top || y > bottom) return;
            ctx.beginPath();
            ctx.arc(axisX, y, SLOT_RADIUS, 0, Math.PI * 2);
            ctx.stroke();
        });
        ctx.restore();
    }

    private drawVerticalDropTarget(ctx: CanvasRenderingContext2D, axisX: number, width: number, timeToY: (time: number) => number): void {
        const dragging = this.dragging;
        if (!dragging || dragging.kind !== 'marker' || this.dragGhost === null) return;
        const y = timeToY(this.dragGhost);
        const accent = this.css('--interactive-accent', '#7c3aed');

        ctx.save();
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.35;
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        ctx.setLineDash([]);

        ctx.globalAlpha = 1;
        ctx.fillStyle = accent;
        ctx.beginPath(); ctx.arc(axisX, y, SLOT_RADIUS + 2.5, 0, Math.PI * 2); ctx.fill();

        const label = this.formatEditDate(this.dragGhost);
        ctx.font = `600 11px ${this.css('--font-interface', 'sans-serif')}`;
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = this.css('--background-secondary', '#1f2937');
        ctx.fillRect(axisX + 10, y - 8, textWidth + 8, 16);
        ctx.fillStyle = this.css('--text-normal', '#e5e7eb');
        ctx.fillText(label, axisX + 14, y + 4);
        ctx.restore();
    }

    private drawPointMarker(ctx: CanvasRenderingContext2D, x: number, y: number, item: NativeItem): void {
        ctx.save();
        ctx.fillStyle = this.markerColor(item);
        if (item.event.isMilestone) {
            this.starPath(ctx, x, y, 7.5);
            ctx.fill();
            // A thin darker rim keeps the gold's points legible against a light
            // theme or a pale era band. A chosen colour is left exactly as
            // chosen, so no rim there.
            if (!item.customColor) {
                ctx.strokeStyle = this.css('--sts-timeline-milestone-edge', MILESTONE_GOLD_EDGE);
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        } else {
            ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        }
        // A grab ring on anything that can be dragged. Slots alone were not
        // enough of a signal: they are hidden whenever the zoom puts them
        // closer than the pitch, so at a wide view turning edit mode on changed
        // nothing on screen and read as the toggle being broken.
        if (this.slotsVisible() && this.isDraggable(item)) {
            ctx.strokeStyle = this.css('--interactive-accent', '#7c3aed');
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.9;
            ctx.beginPath(); ctx.arc(x, y, item.event.isMilestone ? 10.5 : 8.5, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
    }

    private drawEras(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        if (!this.options.showEras) return;
        const eras = (this.plugin.settings.timelineEras || []).filter(era => era.visible !== false);
        eras.forEach(era => {
            const start = this.parseDate(era.startDate); const end = this.parseDate(era.endDate);
            if (!Number.isFinite(start) || !Number.isFinite(end)) return;
            const x1 = this.timeToX(start, width); const x2 = this.timeToX(end, width);
            const axisHeight = this.axisHeight();
            ctx.save(); ctx.globalAlpha = 0.1; ctx.fillStyle = era.color || '#8b5cf6'; ctx.fillRect(x1, axisHeight, x2 - x1, height - axisHeight); ctx.restore();
        });
    }

    /**
     * Where an item sits, even when it was never drawn.
     *
     * An arrow needs both ends. Reading positions only off drawn items meant an
     * arrow vanished the moment its source scrolled off, taking a visible
     * dependency with it. Off-screen ends get a rectangle computed from their
     * time and row instead, and the canvas clips the line for us.
     */
    private itemRect(item: NativeItem, lane: Lane, width: number): DOMRect {
        if (item.rect) return item.rect;
        const rowHeight = this.rowHeight();
        const chronology = !this.options.ganttMode;
        const x1 = this.timeToX(item.start, width);
        const x2 = this.timeToX(item.end, width);
        const top = lane.top - this.scrollTop;
        if (chronology) {
            const chipWidth = this.ctx ? this.chipWidth(this.ctx, item, MIN_CHRONOLOGY_CHIP_WIDTH) : MAX_CHIP_WIDTH;
            return new DOMRect(x1 + 9, top + CHRONOLOGY_CHIP_TOP + item.row * rowHeight, chipWidth, rowHeight - 7);
        }
        const isPoint = Math.abs(x2 - x1) < 3;
        const chipWidth = this.ctx ? this.chipWidth(this.ctx, item, MIN_CHIP_WIDTH) : MAX_CHIP_WIDTH;
        return new DOMRect(
            isPoint ? x1 - 7 : x1,
            top + 7 + item.row * rowHeight,
            isPoint ? chipWidth : Math.max(24, x2 - x1),
            rowHeight - 7
        );
    }

    private drawConnectors(ctx: CanvasRenderingContext2D, width: number, _height: number): void {
        // Indexed over every item, not just the drawn ones, so an arrow keeps
        // both ends when one of them scrolls out of view.
        const byKey = new Map<string, { item: NativeItem; lane: Lane }[]>();
        this.lanes.forEach(lane => lane.items.forEach(item => {
            [this.eventKey(item.event), item.event.name].forEach(key => {
                const values = byKey.get(key) || []; values.push({ item, lane }); byKey.set(key, values);
            });
        }));
        ctx.save();
        ctx.strokeStyle = this.css('--interactive-accent', '#8b5cf6');
        ctx.lineWidth = 2;
        if (this.options.dependencyArrowStyle === 'dashed') ctx.setLineDash([8, 5]);
        if (this.options.dependencyArrowStyle === 'dotted') ctx.setLineDash([2, 4]);
        const endsOf = (target: NativeItem, ref: string): { from: DOMRect; to: DOMRect } | null => {
            const source = (byKey.get(ref) || [])[0];
            const targetEntry = (byKey.get(this.eventKey(target.event)) || []).find(entry => entry.item === target);
            if (!source || !targetEntry) return null;
            return {
                from: this.itemRect(source.item, source.lane, width),
                to: this.itemRect(target, targetEntry.lane, width)
            };
        };
        if (this.options.ganttMode && this.options.showDependencies) {
            this.lanes.forEach(lane => lane.items.forEach(target => (target.event.dependencies || []).forEach(ref => {
                const ends = endsOf(target, ref);
                if (ends) this.arrow(ctx, ends.from.right, ends.from.y + ends.from.height / 2, ends.to.x, ends.to.y + ends.to.height / 2);
            })));
        }
        if (this.options.narrativeOrder) {
            this.lanes.forEach(lane => lane.items.forEach(target => {
                const ref = target.event.narrativeMarkers?.targetEvent;
                const ends = ref ? endsOf(target, ref) : null;
                if (ends) this.curve(ctx, ends.from, ends.to);
            }));
        }
        ctx.restore();
    }

    private drawForkBranches(ctx: CanvasRenderingContext2D, width: number, _height: number): void {
        if (this.filters.forkId !== '__compare__' || this.lanes.length < 2) return;
        const forks = this.plugin.getTimelineForks();
        forks.forEach((fork, index) => {
            const lane = this.lanes[index + 1]; if (!lane) return;
            const x = this.timeToX(this.parseDate(fork.divergenceDate), width);
            const mainY = this.lanes[0].top - this.scrollTop + 16;
            const branchY = lane.top - this.scrollTop + 16;
            ctx.save(); ctx.strokeStyle = lane.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, mainY); ctx.bezierCurveTo(x + 28, mainY, x + 28, branchY, x + 56, branchY); ctx.stroke(); ctx.restore();
        });
    }

    private drawNow(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        const now = Date.now(); if (now < this.viewStart || now > this.viewEnd) return;
        const x = this.timeToX(now, width); ctx.save(); ctx.strokeStyle = this.css('--color-red', '#ef4444'); ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(x, this.axisHeight()); ctx.lineTo(x, height); ctx.stroke(); ctx.restore();
    }

    private drawNowVertical(ctx: CanvasRenderingContext2D, axisX: number, top: number, bottom: number): void {
        const now = Date.now();
        if (now < this.viewStart || now > this.viewEnd) return;
        const y = top + (now - this.viewStart) / (this.viewEnd - this.viewStart) * (bottom - top);
        ctx.save(); ctx.strokeStyle = this.css('--color-red', '#ef4444'); ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(axisX - 16, y); ctx.lineTo(axisX + 16, y); ctx.stroke(); ctx.restore();
    }

    private onPointerDown(event: PointerEvent): void {
        if (!this.canvas) return;
        this.canvas.setPointerCapture(event.pointerId);
        this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.activePointers.size === 2) {
            this.beginPinch();
            this.dragging = null;
            return;
        }
        // Markers are tested before chips: they sit on the baseline well above
        // the first chip row, so the two never contend for the same pointer.
        const marker = this.slotsVisible() ? this.markerAt(event.offsetX, event.offsetY) : null;
        if (marker) {
            this.selected = marker; this.options.onEventSelected?.(marker.event);
            this.dragGhost = marker.start;
            this.dragging = { kind: 'marker', x: event.clientX, y: event.clientY, start: marker.start, end: marker.end, item: marker };
            this.scheduleDraw();
            return;
        }
        const item = this.hit(event.offsetX, event.offsetY);
        if (item) {
            this.selected = item; this.options.onEventSelected?.(item.event);
            this.dragging = this.options.editMode
                ? { kind: 'move', x: event.clientX, y: event.clientY, start: item.start, end: item.end, item }
                : event.pointerType === 'touch'
                    ? { kind: 'pan', x: event.clientX, y: event.clientY, start: this.viewStart, end: this.viewEnd }
                    : null;
            this.scheduleDraw();
            return;
        }
        this.selected = null; this.options.onEventSelected?.(null);
        this.dragging = { kind: 'pan', x: event.clientX, y: event.clientY, start: this.viewStart, end: this.viewEnd };
    }

    /** Conflicts recorded against this event, worst first. */
    private conflictsFor(event: Event): DetectedConflict[] {
        return this.conflictsByEvent.get(this.eventKey(event)) ?? [];
    }

    private conflictSeverity(event: Event): 'error' | 'warning' | null {
        const conflicts = this.conflictsFor(event);
        if (conflicts.some(conflict => conflict.severity === 'error')) return 'error';
        if (conflicts.some(conflict => conflict.severity === 'warning')) return 'warning';
        return null;
    }

    /**
     * Fill the hover card for an item.
     *
     * Canvas has no per-region title attribute, so the detail the vis renderer
     * put in a tooltip is drawn into a floating element instead.
     */
    private buildTooltip(item: NativeItem): void {
        const tooltip = this.tooltipEl;
        if (!tooltip) return;
        tooltip.empty();
        const event = item.event;

        tooltip.createDiv({ cls: 'sts-native-timeline-tooltip-title', text: event.name || '(Untitled event)' });

        const when = event.dateTime?.trim();
        if (when) tooltip.createDiv({ cls: 'sts-native-timeline-tooltip-meta', text: when });

        const where = event.location ? this.resolveLocationName(event.location) : '';
        if (where) tooltip.createDiv({ cls: 'sts-native-timeline-tooltip-meta', text: `@ ${where}` });

        if (this.lanes.length > 1 && item.laneLabel) {
            tooltip.createDiv({ cls: 'sts-native-timeline-tooltip-meta', text: item.laneLabel });
        }

        if (event.description) {
            const text = event.description.length > 160 ? `${event.description.slice(0, 160)}…` : event.description;
            tooltip.createDiv({ cls: 'sts-native-timeline-tooltip-body', text });
        }

        const conflicts = this.conflictsFor(event);
        if (conflicts.length) {
            const list = tooltip.createDiv({ cls: 'sts-native-timeline-tooltip-conflicts' });
            conflicts.slice(0, 3).forEach(conflict => {
                list.createDiv({
                    cls: `sts-native-timeline-tooltip-conflict is-${conflict.severity}`,
                    text: conflict.message
                });
            });
            if (conflicts.length > 3) {
                list.createDiv({
                    cls: 'sts-native-timeline-tooltip-conflict',
                    text: `and ${conflicts.length - 3} more`
                });
            }
        }
    }

    private showTooltip(item: NativeItem, x: number, y: number): void {
        const tooltip = this.tooltipEl;
        const root = this.root;
        if (!tooltip || !root) return;
        if (this.hovered !== item) {
            this.hovered = item;
            this.buildTooltip(item);
        }
        tooltip.show();
        // Flip to the other side of the cursor when the card would run past the
        // edge, so it never gets clipped by the timeline's own overflow.
        const width = tooltip.offsetWidth;
        const height = tooltip.offsetHeight;
        const left = x + 14 + width > root.clientWidth ? Math.max(4, x - width - 14) : x + 14;
        const top = y + 18 + height > root.clientHeight ? Math.max(4, y - height - 12) : y + 18;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }

    private hideTooltip(): void {
        this.hovered = null;
        this.tooltipEl?.hide();
    }

    private onHoverMove(event: PointerEvent): void {
        if (this.dragging || this.pinch) {
            this.hideTooltip();
            return;
        }
        const marker = this.slotsVisible() ? this.markerAt(event.offsetX, event.offsetY) : null;
        const vertical = !this.options.ganttMode && this.options.timelineOrientation === 'vertical';
        if (this.canvas) this.canvas.style.cursor = marker ? (vertical ? 'ns-resize' : 'ew-resize') : '';
        const item = marker ?? this.hit(event.offsetX, event.offsetY);
        if (item) this.showTooltip(item, event.offsetX, event.offsetY);
        else this.hideTooltip();
    }

    private onPointerMove(event: PointerEvent): void {
        this.onHoverMove(event);
        if (this.activePointers.has(event.pointerId)) this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.activePointers.size >= 2 && this.pinch) {
            this.updatePinch();
            return;
        }
        if (!this.dragging || !this.root) return;
        const vertical = !this.options.ganttMode && this.options.timelineOrientation === 'vertical';
        const plotSize = vertical ? Math.max(1, this.root.clientHeight - 52) : Math.max(1, this.root.clientWidth - SIDEBAR_WIDTH);
        const pointerDelta = vertical ? event.clientY - this.dragging.y : event.clientX - this.dragging.x;
        // Two different conversions, because dragging.start/end mean two
        // different things. For a pan they are the view window, and the content
        // moves with the cursor, so the span is theirs and the sign is negated.
        // For an item they are that event's own start and end — using their
        // difference as the scale pinned every point event to zero movement and
        // scaled ranges by their own duration.
        const deltaTime = this.dragging.kind === 'pan'
            ? -pointerDelta / plotSize * (this.dragging.end - this.dragging.start)
            : pointerDelta / plotSize * (this.viewEnd - this.viewStart);
        if (this.dragging.kind === 'pan') {
            this.viewStart = this.dragging.start + deltaTime; this.viewEnd = this.dragging.end + deltaTime;
            if (!vertical) {
                this.scrollTop = Math.max(0, Math.min(this.maxLaneScroll(), this.scrollTop - (event.clientY - this.dragging.y)));
                this.dragging.y = event.clientY;
            }
        } else if (this.dragging.kind === 'marker') {
            // Ghost only. Moving the item here would repack the rows beneath
            // the cursor on every frame, which reads as the lane jittering.
            this.dragGhost = this.snap(this.dragging.start + deltaTime);
        } else if (this.dragging.item) {
            const duration = this.dragging.end - this.dragging.start;
            const snapped = this.snap(this.dragging.start + deltaTime);
            this.dragging.item.start = snapped; this.dragging.item.end = snapped + duration;
        }
        this.scheduleDraw();
    }

    private async onPointerUp(event: PointerEvent): Promise<void> {
        this.activePointers.delete(event.pointerId);
        if (this.pinch) {
            this.pinch = null;
            this.dragging = null;
            this.canvas?.releasePointerCapture(event.pointerId);
            const remaining = Array.from(this.activePointers.values())[0];
            if (remaining) this.dragging = { kind: 'pan', x: remaining.x, y: remaining.y, start: this.viewStart, end: this.viewEnd };
            return;
        }
        if (!this.dragging) {
            this.canvas?.releasePointerCapture(event.pointerId);
            return;
        }
        const dragging = this.dragging; this.dragging = null;
        const ghost = this.dragGhost; this.dragGhost = null;
        this.canvas?.releasePointerCapture(event.pointerId);

        if (dragging.kind === 'marker' && dragging.item) {
            // The item was never moved during the drag, so apply the ghost now.
            if (ghost === null || ghost === dragging.start) { this.scheduleDraw(); return; }
            const duration = dragging.end - dragging.start;
            dragging.item.start = ghost; dragging.item.end = ghost + duration;
        }
        if ((dragging.kind === 'move' || dragging.kind === 'marker') && dragging.item && dragging.item.start !== dragging.start) {
            const item = dragging.item;
            const oldDate = item.event.dateTime;
            const duration = dragging.end - dragging.start;
            const startText = this.formatEditDate(item.start);
            const endText = duration > 0 ? this.formatEditDate(item.end) : '';
            item.event.dateTime = duration > 0 ? `${startText} to ${endText}` : startText;
            // The old date goes in the notice because there is no undo: it is
            // the only record of where the event came from.
            try { await this.plugin.saveEvent(item.event); new Notice(`Moved “${item.event.name}” from ${oldDate || 'no date'} to ${item.event.dateTime}`); }
            catch (error) { item.event.dateTime = oldDate; item.start = dragging.start; item.end = dragging.end; new Notice(`Could not move event: ${error instanceof Error ? error.message : String(error)}`); }
            this.rebuild(false);
        }
    }

    /**
     * Wheel deltas in pixels, whatever unit the device reports them in.
     *
     * A mouse that reports lines sends about 3 per notch where a trackpad sends
     * about 100. Reading deltaY raw made the same gesture roughly thirty times
     * weaker on one device than the other.
     */
    private wheelPixels(value: number, mode: number, pageSize: number): number {
        if (mode === WheelEvent.DOM_DELTA_LINE) return value * WHEEL_LINE_HEIGHT;
        if (mode === WheelEvent.DOM_DELTA_PAGE) return value * pageSize;
        return value;
    }

    private panBy(pixels: number, plotSize: number): void {
        const delta = pixels / plotSize * (this.viewEnd - this.viewStart);
        this.viewStart += delta;
        this.viewEnd += delta;
    }

    private zoomAt(pixels: number, pointer: number, plotSize: number): void {
        const anchor = this.viewStart + pointer / plotSize * (this.viewEnd - this.viewStart);
        const factor = Math.exp(pixels * 0.0015);
        const span = Math.max(this.minimumSpan(), Math.min(MAX_SPAN, (this.viewEnd - this.viewStart) * factor));
        const ratio = (anchor - this.viewStart) / (this.viewEnd - this.viewStart);
        this.viewStart = anchor - span * ratio;
        this.viewEnd = this.viewStart + span;
    }

    /**
     * Wheel zooms at the cursor, shift+wheel pans along time.
     *
     * Lane scrolling stays reachable two ways when the lanes overflow: alt+wheel
     * anywhere, or an ordinary wheel over the lane sidebar, where zooming the
     * time axis would not be what anyone meant.
     */
    private onWheel(event: WheelEvent): void {
        if (!this.root) return;
        event.preventDefault();
        const vertical = !this.options.ganttMode && this.options.timelineOrientation === 'vertical';
        const plotSize = vertical
            ? Math.max(1, this.root.clientHeight - 52)
            : Math.max(1, this.root.clientWidth - SIDEBAR_WIDTH);
        const deltaY = this.wheelPixels(event.deltaY, event.deltaMode, plotSize);
        const deltaX = this.wheelPixels(event.deltaX, event.deltaMode, plotSize);

        const overSidebar = !vertical && event.offsetX < SIDEBAR_WIDTH;
        const canScrollLanes = this.maxLaneScroll() > 0;
        if (canScrollLanes && (event.altKey || overSidebar)) {
            this.scrollTop = Math.max(0, Math.min(this.maxLaneScroll(), this.scrollTop + deltaY));
            this.scheduleDraw();
            return;
        }

        // A horizontal wheel or trackpad swipe reads as panning on any axis.
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            this.panBy(deltaX, plotSize);
            this.scheduleDraw();
            return;
        }

        // Shift zooms, a plain wheel scrolls. The reverse is common in mapping
        // apps but wrong here: this lives in a scrollable note pane, where a
        // bare wheel is expected to move the content, not rescale it.
        if (event.shiftKey) {
            const pointer = vertical
                ? Math.max(0, event.offsetY - 28)
                : Math.max(0, event.offsetX - SIDEBAR_WIDTH);
            this.zoomAt(deltaY, pointer, plotSize);
        } else if (canScrollLanes) {
            this.scrollTop = Math.max(0, Math.min(this.maxLaneScroll(), this.scrollTop + deltaY));
        } else {
            this.panBy(deltaY, plotSize);
        }
        this.scheduleDraw();
    }

    private beginPinch(): void {
        if (!this.root) return;
        const points = Array.from(this.activePointers.values());
        if (points.length < 2) return;
        const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
        const vertical = !this.options.ganttMode && this.options.timelineOrientation === 'vertical';
        const center = vertical ? (points[0].y + points[1].y) / 2 : (points[0].x + points[1].x) / 2;
        const bounds = this.root.getBoundingClientRect();
        const local = vertical ? center - bounds.top - 28 : center - bounds.left - SIDEBAR_WIDTH;
        const size = vertical ? Math.max(1, this.root.clientHeight - 52) : Math.max(1, this.root.clientWidth - SIDEBAR_WIDTH);
        const ratio = Math.max(0, Math.min(1, local / size));
        this.pinch = { distance: Math.max(1, distance), span: this.viewEnd - this.viewStart, anchorTime: this.viewStart + ratio * (this.viewEnd - this.viewStart) };
    }

    private updatePinch(): void {
        if (!this.root || !this.pinch) return;
        const points = Array.from(this.activePointers.values());
        if (points.length < 2) return;
        const distance = Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y));
        const span = Math.max(this.minimumSpan(), Math.min(MAX_SPAN, this.pinch.span * this.pinch.distance / distance));
        const vertical = !this.options.ganttMode && this.options.timelineOrientation === 'vertical';
        const center = vertical ? (points[0].y + points[1].y) / 2 : (points[0].x + points[1].x) / 2;
        const bounds = this.root.getBoundingClientRect();
        const local = vertical ? center - bounds.top - 28 : center - bounds.left - SIDEBAR_WIDTH;
        const size = vertical ? Math.max(1, this.root.clientHeight - 52) : Math.max(1, this.root.clientWidth - SIDEBAR_WIDTH);
        const ratio = Math.max(0, Math.min(1, local / size));
        this.viewStart = this.pinch.anchorTime - span * ratio;
        this.viewEnd = this.viewStart + span;
        this.scheduleDraw();
    }

    private maxLaneScroll(): number {
        if (!this.root) return 0;
        const total = this.lanes.reduce((sum, lane) => sum + lane.height, this.axisHeight());
        return Math.max(0, total - this.root.clientHeight);
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (!this.selected || !this.options.editMode || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        // Step the start, then shift the end by the same amount so the event
        // keeps its duration even when the calendar's units are uneven.
        const delta = this.step(this.selected.start, event.key === 'ArrowLeft' ? -1 : 1) - this.selected.start;
        this.selected.start += delta; this.selected.end += delta; this.scheduleDraw();
    }

    private openAt(x: number, y: number): void {
        const item = this.hit(x, y); if (!item || item.event.tags?.includes('watched-note')) return;
        // A scene is not an event. Editing one here would hand EventModal a
        // synthetic object and saveEvent would write it out as a new event note,
        // so open the scene itself instead.
        if (item.event.tags?.includes('scene')) {
            if (item.event.filePath) void this.app.workspace.openLinkText(item.event.filePath, '', false);
            return;
        }
        new EventModal(this.app, this.plugin, item.event, async updated => { await this.plugin.saveEvent(updated); await this.refresh(); }).open();
    }

    private hit(x: number, y: number): NativeItem | null {
        for (let i = this.visibleItems.length - 1; i >= 0; i--) { const rect = this.visibleItems[i].rect; if (rect && x >= rect.x && x <= rect.right && y >= rect.y && y <= rect.bottom) return this.visibleItems[i]; }
        return null;
    }

    private shouldInclude(event: Event): boolean {
        if (!event.dateTime) return false;
        if (this.filters.milestonesOnly && !event.isMilestone) return false;
        if (this.filters.characters?.size && !event.characters?.some(value => this.filters.characters!.has(value))) return false;
        if (this.filters.locations?.size && !this.eventLocations(event).some(value => this.filters.locations!.has(value))) return false;
        if (this.filters.groups?.size && !event.groups?.some(value => this.filters.groups!.has(value))) return false;
        if (this.filters.tags?.size && !event.tags?.some(value => this.filters.tags!.has(value))) return false;
        return true;
    }

    /** Every location an item can be filtered by. Scenes can link more than one. */
    /**
     * A location's display name. Events store either an id or an already
     * readable name, so try both before falling back to the raw value.
     */
    private resolveLocationName(value: string): string {
        const match = this.locations.find(location => location.id === value)
            || this.locations.find(location => location.name === value);
        return match?.name || value;
    }

    /**
     * A character's display name.
     *
     * Events store either an id or a name depending on when and how they were
     * written, which showed up as raw ids like char-sera-vale in the lane list,
     * and worse, as two lanes for one character when some of their events used
     * the id and others the name.
     */
    private resolveCharacterName(value: string): string {
        const match = this.characters.find(character => character.id === value)
            || this.characters.find(character => character.name === value);
        return match?.name || value;
    }

    private eventLocations(event: Event): string[] {
        const sceneLocations = (event as TimelineEvent)._sceneLocations;
        if (sceneLocations?.length) return sceneLocations;
        return event.location ? [event.location] : [];
    }

    /**
     * Fork membership, applied to real events only. Scenes and watched notes are
     * never fork members, so running them through this would empty the timeline
     * of everything but events as soon as a fork is selected.
     */
    private matchesFork(event: Event): boolean {
        const key = this.eventKey(event);
        if (this.filters.forkId && this.filters.forkId !== '__compare__') {
            const fork = this.plugin.getTimelineFork(this.filters.forkId);
            return Boolean(fork?.forkEvents?.includes(key));
        }
        if (this.filters.forkId === undefined) {
            return !this.plugin.getTimelineForks().some(fork => fork.forkEvents?.includes(key));
        }
        return true;
    }

    private async loadOptionalSources(): Promise<void> {
        try { this.scenes = await this.plugin.listScenes(); } catch { this.scenes = []; }
        this.watchedNotes = [];
        const property = this.plugin.settings.timelineWatchProperty || 'timeline-date';
        const tag = (this.plugin.settings.timelineWatchTag || 'timeline').replace(/^#/, '');
        this.app.vault.getMarkdownFiles().forEach(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
            const value = frontmatter?.[property];
            const tagged = cache?.tags?.some(candidate => candidate.tag === `#${tag}`);
            const fallback = frontmatter?.date;
            const date = typeof value === 'string' ? value : tagged && typeof fallback === 'string' ? fallback : null;
            if (date) this.watchedNotes.push({ name: typeof frontmatter?.title === 'string' ? frontmatter.title : file.basename, date, filePath: file.path });
        });
    }

    private eventStart(event: Event): number { return event.dateTime ? this.parseDate(event.dateTime.split(/\s+(?:to|through|until)\s+/i)[0]) : Number.POSITIVE_INFINITY; }
    private parseDate(value: string): number {
        const calendar = this.calendarRegistry.getActiveCalendar();
        if (calendar.id !== GREGORIAN_CALENDAR.id) {
            const absoluteDay = parseToAbsoluteDay(value, calendar);
            if (absoluteDay != null) return (absoluteDay - this.unixEpochAbsoluteDay()) * DAY_MS;
        }
        const parsed = parseEventDate(value, { referenceDate: this.referenceDate });
        return toMillis(parsed.start) ?? NaN;
    }
    private eventKey(event: Event): string { return String(event.id || event.name); }
    private timeToX(time: number, width: number): number { return SIDEBAR_WIDTH + (time - this.viewStart) / (this.viewEnd - this.viewStart) * Math.max(1, width - SIDEBAR_WIDTH); }
    private rowHeight(): number { return Math.round(24 + (100 - this.options.density) * 0.16); }
    private minimumSpan(): number { return this.calendarRegistry.getActiveCalendar().baseUnit === 'minute' ? 60_000 : DAY_MS; }

    /** The visible window expressed in the shared absolute-day space. */
    private axisView(): AxisView {
        const vertical = !this.options.ganttMode && this.options.timelineOrientation === 'vertical';
        const size = !this.root ? 900
            : vertical ? Math.max(1, this.root.clientHeight - 52)
            : Math.max(1, this.root.clientWidth - SIDEBAR_WIDTH);
        const epoch = this.unixEpochAbsoluteDay();
        return { startDay: this.viewStart / DAY_MS + epoch, endDay: this.viewEnd / DAY_MS + epoch, widthPx: size };
    }

    private snapResolution(): SnapResolution {
        return chooseSnapResolution(this.calendarRegistry.getActiveCalendar(), this.axisView());
    }

    /**
     * Round an edit to the nearest boundary of the active calendar. Times are
     * carried as milliseconds here but calendars only speak absolute days, so
     * the round trip goes through {@link unixEpochAbsoluteDay}.
     */
    private snap(value: number): number {
        const epoch = this.unixEpochAbsoluteDay();
        const snapped = snapDay(this.calendarRegistry.getActiveCalendar(), value / DAY_MS + epoch, this.snapResolution());
        return (snapped - epoch) * DAY_MS;
    }

    /** One snap unit away from `value`, in this calendar rather than in fixed milliseconds. */
    private step(value: number, direction: 1 | -1): number {
        const epoch = this.unixEpochAbsoluteDay();
        const stepped = stepDay(this.calendarRegistry.getActiveCalendar(), value / DAY_MS + epoch, this.snapResolution(), direction);
        return (stepped - epoch) * DAY_MS;
    }
    private formatEditDate(value: number): string {
        const calendar = this.calendarRegistry.getActiveCalendar();
        if (calendar.id !== GREGORIAN_CALENDAR.id) return formatAbsoluteDay(value / DAY_MS + this.unixEpochAbsoluteDay(), calendar, calendar.baseUnit === 'minute' ? 'time' : 'day');
        return new Date(value).toISOString().replace('T', ' ').replace(/:00\.000Z$/, '');
    }
    private unixEpochAbsoluteDay(): number { return toAbsolute(GREGORIAN_CALENDAR, { year: 1970, month: 0, day: 1 }).absoluteDay; }
    private ensureLaneVisible(id: string): void { const lane = this.lanes.find(value => value.id === id); if (lane) this.scrollTop = Math.max(0, lane.top - this.axisHeight()); }
    private colorFor(value: string): string { let hash = 0; for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0; return this.palette[Math.abs(hash) % this.palette.length]; }
    private css(name: string, fallback: string): string {
        const colors = this.calendarRegistry.getActiveTheme().colors;
        const themeValue: Record<string, string | undefined> = {
            '--background-primary': colors?.background,
            '--background-secondary': colors?.surface,
            '--background-secondary-alt': colors?.surface,
            '--background-modifier-border': colors?.grid,
            '--text-normal': colors?.text,
            '--text-muted': colors?.mutedText,
            '--interactive-accent': colors?.accent,
            '--color-red': colors?.now,
        };
        return themeValue[name] || getComputedStyle(this.container).getPropertyValue(name).trim() || fallback;
    }
    private truncate(ctx: CanvasRenderingContext2D, value: string, width: number): string { if (ctx.measureText(value).width <= width) return value; let text = value; while (text.length > 1 && ctx.measureText(`${text}…`).width > width) text = text.slice(0, -1); return `${text}…`; }
    private lowerBound(items: NativeItem[], target: number): number { let low = 0, high = items.length; while (low < high) { const mid = (low + high) >>> 1; if (items[mid].start < target) low = mid + 1; else high = mid; } return low; }

    /**
     * Index of the first item that can still reach into the viewport.
     *
     * Items are sorted by start, so binary searching starts and then stepping
     * back one only catches a single earlier item. Anything that began further
     * back but runs long was dropped, which read as events disappearing off the
     * left as you zoomed. The prefix maximum of ends is non-decreasing, so it
     * can be searched directly for the earliest item whose end still lands in
     * view.
     */
    private firstVisible(lane: Lane, viewStart: number): number {
        const prefix = lane.maxEndPrefix;
        if (!prefix || prefix.length !== lane.items.length) return 0;
        let low = 0, high = prefix.length;
        while (low < high) {
            const mid = (low + high) >>> 1;
            if (prefix[mid] < viewStart) low = mid + 1;
            else high = mid;
        }
        return low;
    }
    private niceTimeStep(raw: number): number { const units = [60_000, 5 * 60_000, 15 * 60_000, 3_600_000, 6 * 3_600_000, DAY_MS, 7 * DAY_MS, 30 * DAY_MS, 90 * DAY_MS, YEAR_MS, 5 * YEAR_MS, 10 * YEAR_MS, 100 * YEAR_MS, 1000 * YEAR_MS]; return units.find(unit => unit >= raw) || Math.ceil(raw / (1000 * YEAR_MS)) * 1000 * YEAR_MS; }
    private formatTick(value: number, step: number): string { const date = new Date(value); if (step >= YEAR_MS) return String(date.getUTCFullYear()); if (step >= DAY_MS) return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: step < 30 * DAY_MS ? 'numeric' : undefined, timeZone: 'UTC' }); return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }); }
    private searchScore(event: Event, query: string): number { const name = event.name.toLowerCase(); const all = [event.name, event.description, event.location, event.status, ...(event.characters || []), ...(event.groups || []), ...(event.tags || [])].filter(Boolean).join(' ').toLowerCase(); if (!all.includes(query)) return -1; if (name === query) return 1000; if (name.startsWith(query)) return 800; if (name.includes(query)) return 500; return 100; }
    /**
     * Dependency arrow from one item to another.
     *
     * Two items on the same row used to be joined by a straight horizontal line
     * at their shared centre height, which ran through the label of everything
     * standing between them. Same-row arrows now dip below the row and come back
     * up, so the line passes under the intervening chips instead of across them.
     */
    private arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        if (Math.abs(y1 - y2) < 2) {
            const dip = y1 + this.rowHeight() * 0.55;
            const inset = Math.min(60, Math.max(12, (x2 - x1) * 0.35));
            ctx.bezierCurveTo(x1 + inset, dip, x2 - inset, dip, x2, y2);
        } else {
            const mid = Math.max(x1 + 18, (x1 + x2) / 2);
            ctx.bezierCurveTo(mid, y1, mid, y2, x2, y2);
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2 - 7, y2 - 4);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x2 - 7, y2 + 4);
        ctx.stroke();
    }
    private roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void { const r = Math.min(radius, width / 2, height / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + width - r, y); ctx.quadraticCurveTo(x + width, y, x + width, y + r); ctx.lineTo(x + width, y + height - r); ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height); ctx.lineTo(x + r, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }
    private curve(ctx: CanvasRenderingContext2D, source: DOMRect, target: DOMRect): void { ctx.save(); ctx.setLineDash([5, 4]); this.arrow(ctx, source.right, source.y + source.height / 2, target.x, target.y + target.height / 2); ctx.restore(); }
    private resizeCanvas(): void { if (!this.canvas || !this.root || !this.ctx) return; const ratio = Math.max(1, window.devicePixelRatio || 1); const width = Math.max(1, this.root.clientWidth); const height = Math.max(1, this.root.clientHeight); this.canvas.width = Math.round(width * ratio); this.canvas.height = Math.round(height * ratio); this.canvas.style.width = `${width}px`; this.canvas.style.height = `${height}px`; this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0); }
    private toCsv(): string { const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`; return ['Name,Date,Status,Location,Characters,Description', ...this.getVisibleEvents().map(event => [event.name, event.dateTime, event.status, event.location, (event.characters || []).join('; '), event.description].map(escape).join(','))].join('\n'); }
    private async writeExport(extension: string, content: string): Promise<void> { const path = `StorytellerSuite/Exports/timeline-${new Date().toISOString().slice(0, 10)}.${extension}`; const existing = this.app.vault.getAbstractFileByPath(path); if (existing instanceof TFile) await this.app.vault.modify(existing, content); else { const folder = 'StorytellerSuite/Exports'; if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder); await this.app.vault.create(path, content); } new Notice(`Timeline exported to ${path}`); }
}

export { NativeTimelineRenderer as TimelineRenderer };
