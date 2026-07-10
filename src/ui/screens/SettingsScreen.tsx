// More/settings: game options, extras, save management.

import { useState } from 'react';
import { useLeague, useStore } from '../../store/store';
import { TopBar } from '../components';
import { audio } from '../../game/audio';

export function SettingsScreen() {
  const league = useLeague();
  const [soundOn, setSoundOn] = useState(audio.soundOn);
  const [musicOn, setMusicOn] = useState(audio.musicOn);
  useStore((s) => s.rev);
  const navigate = useStore((s) => s.navigate);
  const touch = useStore((s) => s.touch);
  const persist = useStore((s) => s.persist);
  const quitToTitle = useStore((s) => s.quitToTitle);

  return (
    <>
      <TopBar title="More" sub={`Season ${league.season}`} />
      <div className="screen">
        <div className="card">
          <h2>Franchise</h2>
          <div className="list-item" onClick={() => navigate('schedule')}>
            <div className="grow name">🗓️ Full Schedule</div>
          </div>
          <div className="list-item" onClick={() => navigate('trade')}>
            <div className="grow name">🔁 Trade Center</div>
          </div>
          <div className="list-item" onClick={() => navigate('freeAgency')}>
            <div className="grow name">💰 Free Agents</div>
          </div>
          <div className="list-item" onClick={() => navigate('history')}>
            <div className="grow name">🏆 League History & Records</div>
          </div>
        </div>

        <div className="card">
          <h2>Sound</h2>
          <div className="btnrow" style={{ marginTop: 0 }}>
            <button
              className={`btn ${soundOn ? '' : 'secondary'}`}
              onClick={() => {
                audio.setSound(!soundOn);
                setSoundOn(!soundOn);
              }}
            >
              🔊 SFX {soundOn ? 'ON' : 'OFF'}
            </button>
            <button
              className={`btn ${musicOn ? '' : 'secondary'}`}
              onClick={() => {
                audio.setMusic(!musicOn);
                setMusicOn(!musicOn);
              }}
            >
              🎵 MUSIC {musicOn ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        <div className="card">
          <h2>Game Settings</h2>
          <div className="field">
            <label>Arcade quarter length (minutes)</label>
            <select
              value={league.settings.quarterMinutes}
              onChange={(e) => {
                league.settings.quarterMinutes = Number(e.target.value);
                touch();
                persist();
              }}
            >
              {[2, 3, 5, 8].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Difficulty</label>
            <select
              value={league.settings.difficulty}
              onChange={(e) => {
                league.settings.difficulty = e.target.value as typeof league.settings.difficulty;
                touch();
                persist();
              }}
            >
              <option value="rookie">Rookie</option>
              <option value="pro">Pro</option>
              <option value="legend">Legend</option>
            </select>
          </div>
        </div>

        <div className="card">
          <h2>Save</h2>
          <button className="btn secondary" onClick={persist}>
            💾 Save Now
          </button>
          <div className="btnrow">
            <button className="btn danger" onClick={quitToTitle}>
              Save & Quit to Title
            </button>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--dim)', marginTop: 10 }}>
            The game autosaves after every week, sim, and transaction.
          </p>
        </div>
      </div>
    </>
  );
}
