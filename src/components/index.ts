/** Shared UI primitives — features import ONLY from '@/components' (barrel). */
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { Chip, CAPACITY_TIER_LABELS, type ChipProps } from './Chip';
export { TierBadge, TIER_META, TIER_ORDER, type TierBadgeProps, type TierId } from './TierBadge';
export { ScoreBubble, displayScore, scoreColorVar, type ScoreBubbleProps } from './ScoreBubble';
export {
  ShowCard,
  formatShowDate,
  eventToShowCardData,
  type ShowCardData,
  type ShowCardProps,
  type ShowCardVariant,
} from './ShowCard';
export { Sheet, type SheetProps } from './Sheet';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { Avatar, type AvatarProps } from './Avatar';
export { Screen, type ScreenProps } from './Screen';
