import { QueryClient } from '@tanstack/react-query';

/** Single app-wide client; provided in App.tsx. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/** Centralized query-key factory. Every hook and every manual cache write uses these. */
export const qk = {
  profile: (userId: string) => ['profile', userId] as const,
  ladder: (userId: string) => ['ladder', userId] as const,
  events: (search: string) => ['events', search] as const,
  catalog: () => ['catalog'] as const,
  friends: (userId: string) => ['friends', userId] as const,
  people: (userId: string) => ['people', userId] as const,
  sharedShows: (userA: string, userB: string) => ['shared-shows', userA, userB] as const,
};
