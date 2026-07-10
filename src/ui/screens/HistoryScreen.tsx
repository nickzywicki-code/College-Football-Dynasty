// League history: champions, awards, All-League teams, record book.

import { useState } from 'react';
import { useLeague, useStore } from '../../store/store';
import { Seg, TopBar } from '../components';

export function HistoryScreen() {
  const league = useLeague();
  const navigate = useStore((s) => s.navigate);
  const [tab, setTab] = useState<'champs' | 'records' | 'awards'>('champs');
  const latest = league.history[league.history.length - 1] ?? null;

  return (
    <>
      <TopBar title="League History" back />
      <div className="screen">
        <Seg<'champs' | 'records' | 'awards'>
          options={[
            { key: 'champs', label: 'Champions' },
            { key: 'awards', label: 'Awards' },
            { key: 'records', label: 'Records' },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'champs' && (
          <div className="card">
            <h2>Champions</h2>
            {league.history.length === 0 && <p className="empty">No completed seasons yet.</p>}
            {[...league.history].reverse().map((h) => (
              <div key={h.season} className="list-item" style={{ cursor: 'default' }}>
                <span style={{ width: 34, color: 'var(--dim)', fontWeight: 700, fontSize: '0.8rem' }}>
                  S{h.season}
                </span>
                <div className="grow">
                  <div className="name">🏆 {h.championName}</div>
                  <div className="meta">def. {h.runnerUpName}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'awards' && (
          <>
            {league.history.length === 0 && (
              <div className="card">
                <p className="empty">Awards are handed out after each season.</p>
              </div>
            )}
            {[...league.history].reverse().map((h) => (
              <div className="card" key={h.season}>
                <h2>Season {h.season} Awards</h2>
                {h.awards.map((a) => (
                  <div
                    key={a.award}
                    className="list-item"
                    onClick={() => navigate('player', { playerId: a.playerId })}
                  >
                    <div className="grow">
                      <div className="name">
                        {a.award}: {a.playerName}
                      </div>
                      <div className="meta">
                        {a.teamAbbr} · {a.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {latest && latest.allLeague.length > 0 && (
              <div className="card">
                <h2>Season {latest.season} All-League Team</h2>
                {latest.allLeague.map((a, i) => (
                  <div key={i} className="list-item" onClick={() => navigate('player', { playerId: a.playerId })}>
                    <span className="pos-badge">{a.pos}</span>
                    <div className="grow name" style={{ fontSize: '0.85rem' }}>
                      {a.playerName}
                    </div>
                    <span style={{ color: 'var(--dim)', fontSize: '0.78rem' }}>{a.teamAbbr}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'records' && (
          <div className="card">
            <h2>Single-Season Records</h2>
            {Object.entries(league.recordBook.singleSeason).length === 0 && (
              <p className="empty">Records are set as seasons complete.</p>
            )}
            {Object.entries(league.recordBook.singleSeason).map(([label, rec]) => (
              <div key={label} className="list-item" style={{ cursor: 'default' }}>
                <div className="grow">
                  <div className="name">{label}</div>
                  <div className="meta">
                    {rec.playerName} ({rec.teamAbbr}) — Season {rec.season}
                  </div>
                </div>
                <span style={{ fontWeight: 800 }}>{rec.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
