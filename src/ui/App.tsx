// App shell: landscape layout with side nav rail, rotate prompt, audio boot.

import { useEffect } from 'react';
import { useStore, Screen } from '../store/store';
import { audio } from '../game/audio';
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
  { screen: 'hub', label: 'HOME', ico: '🏠' },
  { screen: 'roster', label: 'TEAM', ico: '👥' },
  { screen: 'standings', label: 'LEAGUE', ico: '🏆' },
  { screen: 'stats', label: 'STATS', ico: '📊' },
  { screen: 'settings', label: 'MORE', ico: '⚙️' },
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
  const inGame = current.screen === 'game';
  const showNav = league && !inGame && current.screen !== 'title' && current.screen !== 'newLeague';

  // boot audio on first user gesture; click blips on every button press
  useEffect(() => {
    const boot = () => {
      audio.ensure();
      audio.startMusic();
      window.removeEventListener('pointerdown', boot);
    };
    window.addEventListener('pointerdown', boot);
    const clicker = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('button')) audio.play('click');
    };
    document.addEventListener('click', clicker);
    return () => {
      window.removeEventListener('pointerdown', boot);
      document.removeEventListener('click', clicker);
    };
  }, []);

  // duck the music while on the game screen
  useEffect(() => {
    audio.duckMusic(inGame);
  }, [inGame]);

  return (
    <div className="app">
      <div className="rotate-overlay">
        <div className="ball">🏈</div>
        <p>
          ROTATE YOUR DEVICE
          <br />
          GRIDIRON LAND PLAYS IN LANDSCAPE
        </p>
      </div>
      {showNav && (
        <nav className="sidenav">
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
      <div className="main-col">
        <CurrentScreen screen={current.screen} />
      </div>
    </div>
  );
}
