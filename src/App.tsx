import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import {
  createBrowserRouter,
  Navigate,
  NavLink,
  Outlet,
  RouterProvider,
  useLocation,
} from 'react-router-dom';
import { queryClient } from '@/lib/queryClient';
import { ensureSession } from '@/lib/auth';
import { flushPendingLogs } from '@/lib/persist';
import { prewarmAppQueries, SessionContext, useProfile } from '@/lib/hooks';
import { Button } from '@/components';
import { cx } from '@/lib/cx';

// ---------- lazy feature entry points (contract: src/features/README.md) ----------

const OnboardingScreen = lazy(() => import('@/features/onboarding/OnboardingScreen'));
const LogScreen = lazy(() => import('@/features/log/LogScreen'));
const RankFlowScreen = lazy(() => import('@/features/rank/RankFlowScreen'));
const LadderScreen = lazy(() => import('@/features/ladder/LadderScreen'));
const CompareScreen = lazy(() => import('@/features/compare/CompareScreen'));
const RecapScreen = lazy(() => import('@/features/recap/RecapScreen'));

// ---------- splash / error ----------

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg">
      <p className="animate-pulse bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-3xl font-black tracking-tight text-transparent">
        Encore
      </p>
    </div>
  );
}

function BootError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-8 text-center">
      <p className="text-4xl">🎛️</p>
      <h1 className="text-lg font-bold text-ink">Couldn&apos;t reach the venue</h1>
      <p className="max-w-[30ch] text-sm text-ink-faint">{message}</p>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  );
}

// ---------- auth gate (root layout route) ----------

type BootState =
  | { status: 'loading' }
  | { status: 'ready'; session: Session }
  | { status: 'error'; message: string };

function AuthGate() {
  const [boot, setBoot] = useState<BootState>({ status: 'loading' });
  const location = useLocation();
  const warmed = useRef(false);

  const bootstrap = () => {
    setBoot({ status: 'loading' });
    ensureSession()
      .then((session) => setBoot({ status: 'ready', session }))
      .catch((e: unknown) =>
        setBoot({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
      );
  };
  useEffect(bootstrap, []);

  const userId = boot.status === 'ready' ? boot.session.user.id : undefined;
  const profileQuery = useProfile(userId);
  const profile = profileQuery.data;

  // Pre-warm demo-critical queries + retry any stranded log writes, once per boot.
  useEffect(() => {
    if (userId && profile && !warmed.current) {
      warmed.current = true;
      void prewarmAppQueries(userId);
      void flushPendingLogs();
    }
  }, [userId, profile]);

  if (boot.status === 'loading') return <Splash />;
  if (boot.status === 'error') return <BootError message={boot.message} onRetry={bootstrap} />;
  if (profileQuery.isLoading) return <Splash />;

  // No profile yet → onboarding owns the rest of the flow (name picker + backfill).
  if (!profile && location.pathname !== '/welcome') {
    return <Navigate to="/welcome" replace />;
  }

  return (
    <SessionContext.Provider value={{ session: boot.session, userId: boot.session.user.id }}>
      <Suspense fallback={<Splash />}>
        <Outlet />
      </Suspense>
    </SessionContext.Provider>
  );
}

// ---------- bottom tab bar shell ----------

function TabIcon({ name }: { name: 'ladder' | 'log' | 'compare' }) {
  const paths: Record<typeof name, ReactNode> = {
    ladder: (
      <>
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="4" y1="12" x2="16" y2="12" />
        <line x1="4" y1="18" x2="12" y2="18" />
      </>
    ),
    log: (
      <>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </>
    ),
    compare: (
      <>
        <circle cx="8" cy="9" r="3.5" />
        <circle cx="16.5" cy="9.5" r="2.75" />
        <path d="M2.5 19c.8-3 3-4.5 5.5-4.5S12.7 16 13.5 19" />
        <path d="M14.5 18.5c.6-2.2 2.2-3.5 4-3.5 1.4 0 2.6.7 3.4 2" />
      </>
    ),
  };
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}

const TABS = [
  { to: '/', label: 'Ladder', icon: 'ladder' },
  { to: '/log', label: 'Log', icon: 'log' },
  { to: '/compare', label: 'Compare', icon: 'compare' },
] as const;

function TabShell() {
  return (
    <div className="min-h-dvh pb-24">
      <Outlet />
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] border-t border-line bg-bg/90 backdrop-blur-lg">
        <div className="safe-bottom flex items-stretch justify-around">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                cx(
                  'flex flex-1 flex-col items-center gap-1 pt-2.5 pb-2 text-[10px] font-semibold tracking-wide uppercase transition-colors',
                  isActive ? 'text-ink' : 'text-ink-faint',
                )
              }
            >
              {({ isActive }) =>
                tab.icon === 'log' ? (
                  <>
                    <span
                      className={cx(
                        '-mt-5 flex size-11 items-center justify-center rounded-full bg-gradient-to-r from-accent to-accent-2 text-white',
                        isActive ? 'shadow-glow' : 'opacity-90 shadow-none',
                      )}
                    >
                      <TabIcon name="log" />
                    </span>
                    {tab.label}
                  </>
                ) : (
                  <>
                    <TabIcon name={tab.icon} />
                    {tab.label}
                  </>
                )
              }
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

// ---------- route table (contract: src/features/README.md) ----------

const router = createBrowserRouter([
  {
    element: <AuthGate />,
    children: [
      { path: '/welcome', element: <OnboardingScreen /> },
      { path: '/rank/:eventId', element: <RankFlowScreen /> },
      {
        element: <TabShell />,
        children: [
          { path: '/', element: <LadderScreen /> },
          { path: '/log', element: <LogScreen /> },
          { path: '/compare/:friendId?', element: <CompareScreen /> },
          { path: '/recap', element: <RecapScreen /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
