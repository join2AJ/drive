import { useCallback, useEffect, useState } from 'react';
import { Navigation, Route as RouteIcon, BarChart3, Film, Bell } from 'lucide-react';
import { AppProvider, useApp } from './state.jsx';
import Live from './screens/Live.jsx';
import Trips from './screens/Trips.jsx';
import TripDetail from './screens/TripDetail.jsx';
import Insights from './screens/Insights.jsx';
import Vault, { MediaScreen } from './screens/Vault.jsx';
import Alerts, { Incident } from './screens/Alerts.jsx';
import Settings from './screens/Settings.jsx';
import CrashOverlay from './components/CrashOverlay.jsx';
import { Toast } from './components/ui.jsx';

const TABS = [
  { key: 'live', label: 'Live', icon: Navigation, C: Live },
  { key: 'trips', label: 'Trips', icon: RouteIcon, C: Trips },
  { key: 'insights', label: 'Insights', icon: BarChart3, C: Insights },
  { key: 'vault', label: 'Vault', icon: Film, C: Vault },
  { key: 'alerts', label: 'Alerts', icon: Bell, C: Alerts },
];

const PUSHED = { trip: TripDetail, settings: Settings, incident: Incident, media: MediaScreen, vault: Vault };

function Shell() {
  const { alerts, toast, setToast } = useApp();
  const [tab, setTab] = useState('live');
  const [stack, setStack] = useState([]);

  // Pushed screens participate in browser / Android hardware back.
  const push = useCallback((screen, params = {}) => {
    setStack((s) => [...s, { screen, params, key: Date.now() }]);
    history.pushState({ depth: 1 }, '');
  }, []);
  const pop = useCallback(() => history.back(), []);
  useEffect(() => {
    const onPop = () => setStack((s) => s.slice(0, -1));
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  const unread = alerts.filter((a) => a.type === 'crash' || (Date.now() - a.t < 86_400_000 && ['harsh_brake', 'overspeed', 'power_cut'].includes(a.type))).length;
  const Tab = TABS.find((t) => t.key === tab).C;

  return (
    <div className="app">
      <Tab key={tab} push={push} />
      {stack.map((s) => {
        const C = PUSHED[s.screen];
        return <C key={s.key} {...s.params} push={push} pop={pop} />;
      })}
      {!stack.length && (
        <nav className="tabbar">
          {TABS.map(({ key, label, icon: I }) => (
            <button key={key} className={`tab ${tab === key ? 'on' : ''}`} onClick={() => setTab(key)} aria-current={tab === key}>
              <I size={23} strokeWidth={tab === key ? 2.4 : 1.9} />
              {label}
              {key === 'alerts' && unread > 0 && <span className="pip">{unread}</span>}
            </button>
          ))}
        </nav>
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
      <CrashOverlay />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <div className="stage">
        <div className="device"><Shell /></div>
        <div className="stage-caption"><b>Drive</b> — companion app for wired GPS trackers. Everything runs on simulated 1 Hz tracker data; open on a phone for the full-screen experience.</div>
      </div>
    </AppProvider>
  );
}
