import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigation, Route as RouteIcon, BarChart3, CarFront, Bell, WifiOff, SatelliteDish } from 'lucide-react';
import { AppProvider, useApp } from './state.jsx';
import Live from './screens/Live.jsx';
import Trips from './screens/Trips.jsx';
import TripDetail from './screens/TripDetail.jsx';
import Insights from './screens/Insights.jsx';
import Vault, { MediaScreen } from './screens/Vault.jsx';
import Alerts, { Incident } from './screens/Alerts.jsx';
import Settings from './screens/Settings.jsx';
import Controls from './screens/Controls.jsx';
import Costs from './screens/Costs.jsx';
import { IncidentNew, IncidentCase } from './screens/Incidents.jsx';
import Car from './screens/Car.jsx';
import Reminders from './screens/Reminders.jsx';
import FuelLog from './screens/FuelLog.jsx';
import Logbook from './screens/Logbook.jsx';
import Stolen from './screens/Stolen.jsx';
import Drivers, { DriverDetail } from './screens/Drivers.jsx';
import WeeklyReport from './screens/WeeklyReport.jsx';
import Hotspots from './screens/Hotspots.jsx';
import Achievements from './screens/Achievements.jsx';
import Parking from './screens/Parking.jsx';
import Ask from './screens/Ask.jsx';
import ShareViewer from './screens/ShareViewer.jsx';
import CrashOverlay from './components/CrashOverlay.jsx';
import { Toast } from './components/ui.jsx';
import { reminderStatus } from './lib/paperwork.js';

const TABS = [
  { key: 'live', label: 'Live', icon: Navigation, C: Live },
  { key: 'trips', label: 'Trips', icon: RouteIcon, C: Trips },
  { key: 'insights', label: 'Insights', icon: BarChart3, C: Insights },
  { key: 'car', label: 'Car', icon: CarFront, C: Car },
  { key: 'alerts', label: 'Alerts', icon: Bell, C: Alerts },
];

const PUSHED = {
  trip: TripDetail, settings: Settings, incident: Incident, media: MediaScreen, vault: Vault,
  controls: Controls, costs: Costs, newIncident: IncidentNew, case: IncidentCase,
  reminders: Reminders, fuel: FuelLog, logbook: Logbook, stolen: Stolen, drivers: Drivers, driver: DriverDetail,
  weekly: WeeklyReport, hotspots: Hotspots, achievements: Achievements, parking: Parking, ask: Ask,
};

function Shell() {
  const { alerts, toast, setToast, incidents, reminders, odometerKm, network, live } = useApp();
  const [tab, setTab] = useState('live');
  const [stack, setStack] = useState([]);

  // Pushed screens participate in browser / Android hardware back. Some embedded
  // WebViews and sandboxed frames refuse the History API, so fall back to local state.
  const usesHistory = useRef(true);
  const push = useCallback((screen, params = {}) => {
    setStack((s) => [...s, { screen, params, key: Date.now() }]);
    try {
      history.pushState({ depth: 1 }, '');
    } catch {
      usesHistory.current = false;
    }
  }, []);
  const pop = useCallback(() => {
    if (usesHistory.current) history.back();
    else setStack((s) => s.slice(0, -1));
  }, []);
  // Swap the top screen without adding a history entry (e.g. wizard → result).
  const replace = useCallback((screen, params = {}) => {
    setStack((s) => [...s.slice(0, -1), { screen, params, key: Date.now() }]);
  }, []);
  useEffect(() => {
    const onPop = () => setStack((s) => s.slice(0, -1));
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  const unread = incidents.filter((i) => i.status === 'open').length + alerts.filter((a) => (Date.now() - a.t < 86_400_000 && ['harsh_brake', 'overspeed', 'power_cut'].includes(a.type))).length;
  const Tab = TABS.find((t) => t.key === tab).C;
  const now = Date.now();
  const carDue = reminders.filter((r) => reminderStatus(r, now, odometerKm).state === 'overdue').length;

  return (
    <div className="app">
      <Tab key={tab} push={push} />
      {stack.map((s) => {
        const C = PUSHED[s.screen];
        return <C key={s.key} {...s.params} push={push} pop={pop} replace={replace} />;
      })}
      {!stack.length && (
        <nav className="tabbar">
          {TABS.map(({ key, label, icon: I }) => (
            <button key={key} className={`tab ${tab === key ? 'on' : ''}`} onClick={() => setTab(key)} aria-current={tab === key}>
              <I size={23} strokeWidth={tab === key ? 2.4 : 1.9} />
              {label}
              {key === 'alerts' && unread > 0 && <span className="pip">{unread}</span>}
              {key === 'car' && carDue > 0 && <span className="pip">{carDue}</span>}
            </button>
          ))}
        </nav>
      )}
      {!network.connected && (
        <div className="net-pill" role="status">
          {network.phoneOnline ? <SatelliteDish size={14} /> : <WifiOff size={14} />}
          {!network.phoneOnline ? 'Offline · map & data from this phone' : `Car has no signal · ${live.buffered} GPS points waiting`}
        </div>
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
      <CrashOverlay />
    </div>
  );
}

export default function App() {
  // A family member opening a shared-ride link sees only the live ride, not the app.
  const shareToken = location.hash.match(/^#\/share\/([\w-]+)/)?.[1];
  return (
    <AppProvider>
      <div className="stage">
        <div className="device">{shareToken ? <div className="app"><ShareViewer token={shareToken} /></div> : <Shell />}</div>
        <div className="stage-caption"><b>Drive</b> — companion app for wired GPS trackers. Everything runs on simulated 1 Hz tracker data; open on a phone for the full-screen experience.</div>
      </div>
    </AppProvider>
  );
}
