// Which events belong to which branch of the timeline.
//
// A fork records only the events unique to it (`forkEvents`). Everything
// before the divergence is shared trunk that the fork inherits rather than
// copies, so deciding what a branch contains means combining the two.

/** The parts of a TimelineFork that decide membership. */
export interface ForkLike {
    id: string;
    forkEvents?: string[];
}

/** An event is on the main timeline when no fork has claimed it. */
export function isEventOnMain(eventKey: string, forks: ForkLike[]): boolean {
    return !forks.some(fork => fork.forkEvents?.includes(eventKey));
}

/**
 * Whether an event appears when viewing a single branch.
 *
 * A branch is its own events plus the trunk it grew from. Viewing a fork used
 * to show only its own events, which erased the entire shared history before
 * the divergence and left a branch looking like a handful of orphans. Compare
 * mode never had that problem, because it inherits the trunk into each fork's
 * lane; this is the same rule applied to the single-branch view.
 *
 * @param divergence parsed divergence time, NaN when the fork's date is
 *   missing or unparseable. An unreadable date keeps the whole trunk visible:
 *   showing too much history is recoverable, silently hiding a story's past is
 *   not.
 */
export function isEventInFork(
    eventKey: string,
    eventStart: number,
    fork: ForkLike,
    divergence: number,
    allForks: ForkLike[]
): boolean {
    if (fork.forkEvents?.includes(eventKey)) return true;
    // Another branch's exclusive event never bleeds into this one.
    if (!isEventOnMain(eventKey, allForks)) return false;
    if (!Number.isFinite(divergence)) return true;
    // An undated trunk event cannot be placed relative to the divergence;
    // keep it rather than drop it for want of a date.
    if (!Number.isFinite(eventStart)) return true;
    return eventStart <= divergence;
}
