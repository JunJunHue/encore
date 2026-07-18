import type { Transition } from 'framer-motion';

/** One spring for the whole app — a consistent physical feel (design-client.md §4). */
export const SPRING: Transition = { type: 'spring', stiffness: 400, damping: 32 };

/** Snappier spring for tap feedback on comparison cards. */
export const SPRING_SNAP: Transition = { type: 'spring', stiffness: 500, damping: 30 };
