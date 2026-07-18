/**
 * Public engine surface. Feature code imports ONLY from '@/engine'
 * (collab.md seam #1). score.ts is internal and deliberately not re-exported.
 */
export * from './types';
export * from './ranking';
export * from './tiers';
export * from './audit';
export * from './lenses';
export * from './tasteMatch';
export * from './fixtures';
