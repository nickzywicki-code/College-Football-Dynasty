// App shell: screen routing + bottom navigation.

import { useStore, Screen } from '../store/store';
import { Title } from './screens/Title';
import { Hub } from './screens/Hub';
import { Roster } from './screens/Roster';
import { PlayerView } from './screens/PlayerView';
import { ScheduleScreen } from './screens/ScheduleScreen';
import { Standings } from './screens/Standings';
import { StatsScreen } from './screens/StatsScreen';
import { BoxScoreView } from './screens/BoxScoreView';
import { DraftRoom } from './screens/DraftRoom';
import { FreeAgencyScreen } from './screens/FreeAgencyScreen';
import { TradeCenter } from './screens/TradeCenter';
import { HistoryScreen } from './screens/HistoryScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { GameScreen } from './screens/GameScreen';

const TABS: { screen: Screen; label: string; ico: string }[] = [
  { screen: 'hub', label: 'Home', ico: '🏠' },
  { screen: 'roster', label: 'Team', ico: '👥' },
  { screen: 'standings', label: 'League', ico: '🏆' },
  { screen: 'stats', label: 'Stats', ico: '📊' },
  { screen: 'settings', label: 'More', ico: '⚙️' },
];

function CurrentScreen({ screen }: { screen: Screen }) {
  switch (screen) {
    case 'title':
    case 'newLeague':
      return <Title />;
    case 'hub':
      return <Hub />;
    case 'roster':
      return <Roster />;
    case 'player':
      return <PlayerView />;
    case 'schedule':
      return <ScheduleScreen />;
    case 'standings':
      return <Standings />;
    case 'stats':
      return <StatsScreen />;
    case 'boxscore':
      return <BoxScoreView />;
    case 'draft':
      return <DraftRoom />;
    case 'freeAgency':
      return <FreeAgencyScreen />;
    case 'trade':
      return <TradeCenter />;
    case 'history':
      return <HistoryScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'game':
      return <GameScreen />;
  }
}

export function App() {
  const league = useStore((s) => s.league);
  const nav = useStore((s) => s.nav);
  const resetNav = useStore((s) => s.resetNav);
  const current = nav[nav.length - 1];
  const showNav = league && current.screen !== 'game' && current.screen !== 'title' && current.screen !== 'newLeague';

  return (
    <div className="app">
      <CurrentScreen screen={current.screen} />
      {showNav && (
        <nav className="bottomnav">
          {TABS.map((t) => (
            <button
              key={t.screen}
              className={current.screen === t.screen ? 'active' : ''}
              onClick={() => resetNav(t.screen)}
            >
              <span className="ico">{t.ico}</span>
              {t.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
