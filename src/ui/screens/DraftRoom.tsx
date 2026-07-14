// Draft room: pick order, prospect board with scouted ranges, user picks.

import { useMemo, useState } from 'react';
import { useLeague, useStore } from '../../store/store';
import { Seg, TeamDot, TopBar } from '../components';
import { POSITIONS, Position } from '../../engine/types';
import { positionNeed } from '../../engine/franchise/draft';
import { findTradeUpOffers, findTradeBackOffers } from '../../engine/franchise/draftTrades';

export function DraftRoom() {
  const league = useLeague();
  useStore((s) => s.rev);
  const navigate = useStore((s) => s.navigate);
  const makeUserPick = useStore((s) => s.makeUserPick);
  const draftUntilUser = useStore((s) => s.draftUntilUser);
  const draftOnePick = useStore((s) => s.draftOnePick);
  const toggleWatch = useStore((s) => s.toggleWatch);
  const draftPickTrade = useStore((s) => s.draftPickTrade);
  const [posFilter, setPosFilter] = useState<Position | 'ALL'>('ALL');
  const [tab, setTab] = useState<'board' | 'trades' | 'picks' | 'mine'>('board');

  const draft = league.draft;
  const team = league.teams[league.userTeamId];
  const watch = new Set(draft?.watch ?? []);
  const tradeUp = useMemo(() => (draft && !draft.complete ? findTradeUpOffers(league) : []), [draft, league, draft?.currentPickIndex]);
  const tradeBack = useMemo(() => (draft && !draft.complete ? findTradeBackOffers(league) : []), [draft, league, draft?.currentPickIndex]);

  const available = useMemo(
    () =>
      (draft?.prospects ?? [])
        .filter((pr) => !pr.drafted)
        .filter((pr) => posFilter === 'ALL' || league.players[pr.playerId].pos === posFilter)
        .slice(0, 60),
    [draft, league, posFilter, league.draft?.currentPickIndex],
  );

  if (!draft) {
    return (
      <>
        <TopBar title="Draft" back />
        <div className="screen empty">No draft in progress.</div>
      </>
    );
  }

  const onClock = !draft.complete ? draft.order[draft.currentPickIndex] : null;
  const userOnClock = onClock?.teamId === league.userTeamId;
  const myPicks = draft.order.filter((s) => s.teamId === league.userTeamId);
  const needs = POSITIONS.map((pos) => ({ pos, need: positionNeed(league, team, pos) }))
    .sort((a, b) => b.need - a.need)
    .slice(0, 4);

  return (
    <>
      <TopBar
        title="Draft Room"
        sub={
          draft.complete
            ? 'Draft complete'
            : `R${onClock!.round} P${onClock!.pick} — ${league.teams[onClock!.teamId].abbr} on the clock`
        }
        back
      />
      <div className="screen">
        {!draft.complete && (
          <div className="card">
            <div className="row">
              <TeamDot team={league.teams[onClock!.teamId]} size={38} />
              <div className="grow">
                <div style={{ fontWeight: 800 }}>
                  {userOnClock ? "🚨 You're on the clock!" : `${league.teams[onClock!.teamId].city} on the clock`}
                </div>
                <div style={{ color: 'var(--dim)', fontSize: '0.78rem' }}>
                  Round {onClock!.round}, Pick {onClock!.pick} · Your needs:{' '}
                  {needs.map((n) => n.pos).join(', ')}
                </div>
              </div>
            </div>
            {!userOnClock && (
              <div className="btnrow" style={{ marginTop: 12 }}>
                <button className="btn secondary" onClick={draftOnePick}>
                  ▶ Next Pick
                </button>
                <button className="btn warn" onClick={draftUntilUser}>
                  ⏩ Sim to My Pick
                </button>
              </div>
            )}
            {(() => {
              // alert if a watched prospect could go before my next pick
              const nextTaken = draft.prospects.filter((pr) => !pr.drafted && watch.has(pr.playerId));
              return userOnClock === false && nextTaken.length > 0 ? (
                <p style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--gold)' }}>
                  ⭐ On your watchlist, still available: {nextTaken.slice(0, 3).map((pr) => {
                    const p = league.players[pr.playerId];
                    return `${p.pos} ${p.lastName}`;
                  }).join(', ')}
                </p>
              ) : null;
            })()}
          </div>
        )}
        {draft.complete && (
          <div className="card">
            <p style={{ fontSize: '0.85rem', color: 'var(--dim)' }}>
              All 224 picks are in. Head back to the hub to open free agency.
            </p>
            <button className="btn" style={{ marginTop: 10 }} onClick={() => navigate('hub')}>
              Continue ➡️
            </button>
          </div>
        )}

        <Seg<'board' | 'trades' | 'picks' | 'mine'>
          options={[
            { key: 'board', label: 'Board' },
            { key: 'trades', label: `Trade ${tradeUp.length + tradeBack.length ? '•' : ''}` },
            { key: 'picks', label: 'Picks' },
            { key: 'mine', label: 'Mine' },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'board' && (
          <>
            <div className="seg" style={{ overflowX: 'auto' }}>
              {(['ALL', ...POSITIONS] as (Position | 'ALL')[]).map((p) => (
                <button
                  key={p}
                  className={posFilter === p ? 'active' : ''}
                  style={{ minWidth: 44, flex: '0 0 auto' }}
                  onClick={() => setPosFilter(p)}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="card">
              {available.map((pr) => {
                const p = league.players[pr.playerId];
                const watched = watch.has(pr.playerId);
                return (
                  <div key={pr.playerId} className="list-item">
                    <button
                      onClick={() => toggleWatch(pr.playerId)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: 0, filter: watched ? 'none' : 'grayscale(1) opacity(0.4)' }}
                      aria-label="watch"
                    >
                      ⭐
                    </button>
                    <span className="pos-badge">{p.pos}</span>
                    <div className="grow" onClick={() => navigate('player', { playerId: p.id })}>
                      <div className="name">
                        {p.firstName} {p.lastName}
                      </div>
                      <div className="meta">
                        {p.age}y · Scouted {pr.scoutedOvr[0]}–{pr.scoutedOvr[1]} OVR · Potential {pr.scoutedPot}
                      </div>
                    </div>
                    {userOnClock ? (
                      <button className="btn small" onClick={() => makeUserPick(pr.playerId)}>
                        Draft
                      </button>
                    ) : (
                      <span style={{ color: 'var(--dim)', fontSize: '0.8rem', fontWeight: 700 }}>
                        {pr.scoutedOvr[0]}–{pr.scoutedOvr[1]}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === 'trades' && (
          <>
            <div className="card">
              <h2>Trade Up</h2>
              <p style={{ fontSize: '0.76rem', color: 'var(--dim)', margin: '0 0 8px' }}>
                Move up the board — costs you future picks.
              </p>
              {tradeUp.length === 0 && <p className="empty">No trade-up moves available right now.</p>}
              {tradeUp.map((o, i) => (
                <div key={i} className="list-item">
                  <TeamDot team={league.teams[o.partnerId]} size={26} />
                  <div className="grow">
                    <div className="name" style={{ fontSize: '0.82rem' }}>
                      Move up to {o.summary.get} <span style={{ color: 'var(--dim)' }}>({league.teams[o.partnerId].abbr})</span>
                    </div>
                    <div className="meta">You give: {o.summary.give}</div>
                  </div>
                  <button className="btn small" onClick={() => draftPickTrade(o)}>Trade</button>
                </div>
              ))}
            </div>
            <div className="card">
              <h2>Trade Back</h2>
              <p style={{ fontSize: '0.76rem', color: 'var(--dim)', margin: '0 0 8px' }}>
                Slide down for extra picks.
              </p>
              {tradeBack.length === 0 && <p className="empty">No trade-back offers right now.</p>}
              {tradeBack.map((o, i) => (
                <div key={i} className="list-item">
                  <TeamDot team={league.teams[o.partnerId]} size={26} />
                  <div className="grow">
                    <div className="name" style={{ fontSize: '0.82rem' }}>
                      Get {o.summary.get} <span style={{ color: 'var(--dim)' }}>({league.teams[o.partnerId].abbr})</span>
                    </div>
                    <div className="meta">You give: {o.summary.give}</div>
                  </div>
                  <button className="btn small" onClick={() => draftPickTrade(o)}>Trade</button>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'picks' && (
          <div className="card">
            {draft.order
              .slice(Math.max(0, draft.currentPickIndex - 8), draft.currentPickIndex + 24)
              .map((s, i) => {
                const idx = Math.max(0, draft.currentPickIndex - 8) + i;
                const t = league.teams[s.teamId];
                const p = s.selectedPlayerId != null ? league.players[s.selectedPlayerId] : null;
                return (
                  <div
                    key={idx}
                    className="list-item"
                    style={idx === draft.currentPickIndex ? { background: 'var(--card2)', borderRadius: 8 } : undefined}
                    onClick={() => p && navigate('player', { playerId: p.id })}
                  >
                    <span style={{ width: 52, color: 'var(--dim)', fontSize: '0.72rem', fontWeight: 700 }}>
                      R{s.round} P{s.pick}
                    </span>
                    <TeamDot team={t} size={22} />
                    <div className="grow name" style={{ fontSize: '0.83rem' }}>
                      {p ? `${p.pos} ${p.firstName} ${p.lastName}` : idx === draft.currentPickIndex ? 'On the clock…' : '—'}
                    </div>
                    {p && <span style={{ fontSize: '0.78rem', color: 'var(--dim)' }}>{p.overall}</span>}
                  </div>
                );
              })}
          </div>
        )}

        {tab === 'mine' && (
          <div className="card">
            {myPicks.map((s, i) => {
              const p = s.selectedPlayerId != null ? league.players[s.selectedPlayerId] : null;
              return (
                <div key={i} className="list-item" onClick={() => p && navigate('player', { playerId: p.id })}>
                  <span style={{ width: 52, color: 'var(--dim)', fontSize: '0.72rem', fontWeight: 700 }}>
                    R{s.round} P{s.pick}
                  </span>
                  <div className="grow name" style={{ fontSize: '0.85rem' }}>
                    {p ? `${p.pos} ${p.firstName} ${p.lastName} (${p.overall} OVR)` : 'Upcoming'}
                  </div>
                </div>
              );
            })}
            {myPicks.length === 0 && <p className="empty">You traded away all your picks!</p>}
          </div>
        )}
      </div>
    </>
  );
}
