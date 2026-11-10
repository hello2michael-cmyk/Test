import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from './lib/store';
import { useToast } from './lib/toast';
import { Toast } from './components/ui';
import { TabBar, type Tab } from './components/TabBar';
import { Onboarding } from './screens/Onboarding';
import { Today } from './screens/Today';
import { Inbox } from './screens/Inbox';
import { SettingsScreen } from './screens/Settings';
import { MessageDetail } from './screens/MessageDetail';
import { Locked } from './screens/Locked';
import { LockScreen } from './screens/LockScreen';
import { refresh } from './lib/session';
import { initLicense, useLicense } from './lib/license';
import { initAppLock, useAppLock } from './lib/applock';

function useTheme(theme: 'system' | 'dark' | 'light') {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]:not([media])')?.setAttribute('content', dark ? '#0b0d14' : '#f6f5f2');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

const Spinner = () => <div className="grid h-full place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-3/30 border-t-accent" /></div>;

export function App() {
  const { settings, loaded } = useStore();
  const license = useLicense();
  const lock = useAppLock();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('today');
  const [openId, setOpenId] = useState<string | null>(null);
  useTheme(settings.theme);

  // Gate order: owner invite → app lock → onboarding → app.
  useEffect(() => { if (loaded) { void initLicense(); void initAppLock(); } }, [loaded]);

  const active = loaded && license.state === 'ok' && !lock.locked && settings.onboarded;
  useEffect(() => {
    if (!active) return;
    void refresh();
    const onVis = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [active]);

  if (!loaded || license.state === 'checking') return <Spinner />;
  if (license.state === 'locked') return <><Locked /><Toast toast={toast} /></>;
  if (lock.locked && settings.onboarded) return <LockScreen />;
  if (!settings.onboarded) return <><Onboarding /><Toast toast={toast} /></>;

  return (
    <div className="mx-auto flex h-full w-full max-w-[640px] flex-col">
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(96px+env(safe-area-inset-bottom))]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            {tab === 'today' && <Today onOpen={setOpenId} onTab={setTab} />}
            {tab === 'inbox' && <Inbox onOpen={setOpenId} />}
            {tab === 'settings' && <SettingsScreen />}
          </motion.div>
        </AnimatePresence>
      </main>
      <TabBar tab={tab} onTab={setTab} />
      <MessageDetail id={openId} onClose={() => setOpenId(null)} />
      <Toast toast={toast} />
    </div>
  );
}
