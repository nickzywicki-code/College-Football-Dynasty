// Trade center: build player+pick packages, get AI verdicts, execute.

import { useMemo, useState } from 'react';
import { useLeague, useStore } from '../../store/store';
import { PlayerHeadshot, Seg, TeamDot, TopBar } from '../components';
import type { DraftPickAsset, TradeOffer } from '../../engine/types';
import { evaluateTrade, executeTrade, playerTradeValue, pickTradeValue } from '../../engine/franchise/trades';
import { findReturnsForPlayer, packageToAcquire, FoundTrade } from '../../engine/franchise/tradeFinder';

function pickLabel(league: ReturnType<typeof useLeague>, pk: DraftPickAsset): string {
  return `S${pk.season} R${pk.round} (${league.teams[pk.originalTeamId].abbr})`;
}

export function TradeCenter() {
  const league = useLeague();
  useStore((s) => s.rev);
  const touch = useStore((s) => s.touch);
  const persist = useStore((s) => s.persist);
  const [partnerId, setPartnerId] = useState<number>(league.userTeamId === 0 ? 1 : 0);
  const [give, setGive] = useState<Set<number>>(new Set());
  const [get_, setGet] = useState<Set<number>>(new Set());
  const [givePicks, setGivePicks] = useState<Set<string>>(new Set());
  const [getPicks, setGetPicks] = useState<Set<string>>(new Set());
  const [verdict, setVerdict] = useState<string | null>(null);
  const [tab, setTab] = useState<'give' | 'get'>('give');
  const [view, setView] = useState<'builder' | 'finder'>('builder');

  const me = league.teams[league.userTeamId];
  const partner = league.teams[partnerId];
  const canTrade = league.phase === 'regularSeason' || league.phase === 'draft' || league.phase === 'freeAgency';

  // ---- trade finder state ----
  const myPlayersByOvr = useMemo(
    () => me.playerIds.map((id) => league.players[id]).filter(Boolean).sort((a, b) => b.overall - a.overall),
    [me, league],
  );
  const [finderMode, setFinderMode] = useState<'shop' | 'acquire'>('shop');
  const [shopId, setShopId] = useState<number>(myPlayersByOvr[0]?.id ?? -1);
  const [acqPartnerId, setAcqPartnerId] = useState<number>(league.userTeamId === 0 ? 1 : 0);
  const [acqId, setAcqId] = useState<number>(-1);
  const [finderMsg, setFinderMsg] = useState<string | null>(null);

  const shopResults = useMemo<FoundTrade[]>(
    () => (view === 'finder' && finderMode === 'shop' && shopId >= 0 ? findReturnsForPlayer(league, me.id, shopId) : []),
    [view, finderMode, shopId, league, me.id],
  );
  const acqResult = useMemo<FoundTrade | null>(
    () => (view === 'finder' && finderMode === 'acquire' && acqId >= 0 ? packageToAcquire(league, me.id, acqId) : null),
    [view, finderMode, acqId, league, me.id],
  );

  const describe = (playerIds: number[], picks: DraftPickAsset[]): string => {
    const parts = [
      ...playerIds.map((id) => {
        const p = league.players[id];
        return p ? `${p.pos} ${p.lastName} (${p.overall} OVR · ${p.age}y)` : '';
      }),
      ...picks.map((pk) => `${league.teams[pk.originalTeamId].abbr} S${pk.season} R${pk.round}`),
    ].filter(Boolean);
    return parts.length ? parts.join('  +  ') : '—';
  };

  const contractLabel = (id: number): string => {
    const p = league.players[id];
    if (!p) return '';
    return p.contract ? `$${p.contract.salary}M × ${p.contract.yearsLeft}yr` : 'No contract';
  };

  // headshot + detail chips (age · contract · OVR) for a single headline player
  const PlayerFacts = ({ id }: { id: number }) => {
    const p = league.players[id];
    if (!p) return null;
    const t = p.teamId >= 0 ? league.teams[p.teamId] : null;
    return (
      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
        <PlayerHeadshot player={p} colors={t ? t.colors : ['#3a3f5a', '#8b93a8']} size={40} />
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{p.pos} {p.firstName} {p.lastName}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--dim)' }}>
            {p.age}y · {contractLabel(id)} · {p.overall} OVR
            {p.injuryWeeks > 0 && <span style={{ color: 'var(--danger)' }}> · ✚{p.injuryWeeks}w</span>}
          </div>
        </div>
      </div>
    );
  };

  const executeFinder = (ft: FoundTrade) => {
    executeTrade(league, ft.offer);
    touch();
    persist();
    setFinderMsg('🤝 Trade executed! Check your roster.');
    setAcqId(-1);
  };

  const pkKey = (pk: DraftPickAsset) => `${pk.season}-${pk.round}-${pk.originalTeamId}`;

  const buildOffer = (): TradeOffer => ({
    fromTeamId: me.id,
    toTeamId: partner.id,
    playersOut: [...give],
    picksOut: me.draftPicks.filter((pk) => givePicks.has(pkKey(pk))),
    playersIn: [...get_],
    picksIn: partner.draftPicks.filter((pk) => getPicks.has(pkKey(pk))),
  });

  const totalGive = useMemo(
    () =>
      [...give].reduce((s, id) => s + playerTradeValue(league.players[id]), 0) +
      me.draftPicks.filter((pk) => givePicks.has(pkKey(pk))).reduce((s, pk) => s + pickTradeValue(league, pk), 0),
    [give, givePicks, league, me],
  );
  const totalGet = useMemo(
    () =>
      [...get_].reduce((s, id) => s + playerTradeValue(league.players[id]), 0) +
      partner.draftPicks.filter((pk) => getPicks.has(pkKey(pk))).reduce((s, pk) => s + pickTradeValue(league, pk), 0),
    [get_, getPicks, league, partner],
  );

  const reset = () => {
    setGive(new Set());
    setGet(new Set());
    setGivePicks(new Set());
    setGetPicks(new Set());
    setVerdict(null);
  };

  const propose = () => {
    const offer = buildOffer();
    if (offer.playersOut.length + offer.picksOut.length === 0 || offer.playersIn.length + offer.picksIn.length === 0) {
      setVerdict('Add assets to both sides first.');
      return;
    }
    const evals = evaluateTrade(league, offer);
    if (evals.accepted) {
      executeTrade(league, offer);
      setVerdict('🤝 Trade accepted and executed!');
      setGive(new Set());
      setGet(new Set());
      setGivePicks(new Set());
      setGetPicks(new Set());
      touch();
      persist();
    } else {
      setVerdict(`❌ ${evals.verdict}`);
    }
  };

  const toggle = (set: Set<number>, setter: (s: Set<number>) => void, id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
    setVerdict(null);
  };
  const togglePick = (set: Set<string>, setter: (s: Set<string>) => void, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
    setVerdict(null);
  };

  const side = tab === 'give' ? me : partner;
  const sideSel = tab === 'give' ? give : get_;
  const sideSetSel = tab === 'give' ? setGive : setGet;
  const sidePicksSel = tab === 'give' ? givePicks : getPicks;
  const sideSetPicks = tab === 'give' ? setGivePicks : setGetPicks;

  return (
    <>
      <TopBar title="Trade Center" back />
      <div className="screen">
        {!canTrade && (
          <div className="card">
            <p style={{ fontSize: '0.85rem', color: 'var(--dim)' }}>
              Trading is open during the regular season, draft, and free agency.
            </p>
          </div>
        )}

        <Seg<'builder' | 'finder'>
          options={[
            { key: 'builder', label: '🛠 Builder' },
            { key: 'finder', label: '🔎 Trade Finder' },
          ]}
          value={view}
          onChange={setView}
        />

        {view === 'finder' && (
          <>
            <Seg<'shop' | 'acquire'>
              options={[
                { key: 'shop', label: 'Shop My Player' },
                { key: 'acquire', label: 'Acquire a Player' },
              ]}
              value={finderMode}
              onChange={(v) => {
                setFinderMode(v);
                setFinderMsg(null);
              }}
            />
            {finderMsg && (
              <div className="card">
                <p style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>{finderMsg}</p>
              </div>
            )}

            {finderMode === 'shop' && (
              <>
                <div className="card">
                  <h2>Player to Shop</h2>
                  <div className="field">
                    <select value={shopId} onChange={(e) => { setShopId(Number(e.target.value)); setFinderMsg(null); }}>
                      {myPlayersByOvr.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.pos} {p.firstName} {p.lastName} — {p.overall} OVR
                        </option>
                      ))}
                    </select>
                  </div>
                  {shopId >= 0 && <PlayerFacts id={shopId} />}
                  <p style={{ fontSize: '0.78rem', color: 'var(--dim)', margin: 0 }}>
                    Best offers other teams would accept, ranked by what you get back.
                  </p>
                </div>
                {!canTrade ? null : shopResults.length === 0 ? (
                  <div className="card">
                    <p className="empty">No team is biting on this player right now. Try a more valuable player.</p>
                  </div>
                ) : (
                  shopResults.map((ft) => {
                    const partnerT = league.teams[ft.offer.toTeamId];
                    return (
                      <div className="card" key={partnerT.id}>
                        <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                          <TeamDot team={partnerT} size={30} />
                          <b style={{ fontSize: '0.9rem' }}>{partnerT.city} {partnerT.name}</b>
                        </div>
                        <div style={{ fontSize: '0.82rem', marginBottom: 4 }}>
                          <span style={{ color: 'var(--accent)' }}>You get:</span>{' '}
                          {describe(ft.offer.playersIn, ft.offer.picksIn)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--dim)', marginBottom: 10 }}>
                          Return value {ft.returnValue} · you give up {ft.costValue}
                        </div>
                        <button className="btn small" disabled={!canTrade} onClick={() => executeFinder(ft)}>
                          Accept & Execute
                        </button>
                      </div>
                    );
                  })
                )}
              </>
            )}

            {finderMode === 'acquire' && (
              <>
                <div className="card">
                  <h2>Target a Player</h2>
                  <div className="field">
                    <select value={acqPartnerId} onChange={(e) => { setAcqPartnerId(Number(e.target.value)); setAcqId(-1); setFinderMsg(null); }}>
                      {league.teams.filter((t) => t.id !== me.id).map((t) => (
                        <option key={t.id} value={t.id}>{t.city} {t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <select value={acqId} onChange={(e) => { setAcqId(Number(e.target.value)); setFinderMsg(null); }}>
                      <option value={-1}>Select a player…</option>
                      {league.teams[acqPartnerId].playerIds
                        .map((id) => league.players[id])
                        .filter(Boolean)
                        .sort((a, b) => b.overall - a.overall)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.pos} {p.firstName} {p.lastName} — {p.overall} OVR
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                {acqId >= 0 && (
                  acqResult ? (
                    <div className="card">
                      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                        <TeamDot team={me} size={30} />
                        <b style={{ fontSize: '0.9rem' }}>
                          Land {league.players[acqId].pos} {league.players[acqId].lastName}
                        </b>
                      </div>
                      <PlayerFacts id={acqId} />
                      <div style={{ fontSize: '0.82rem', marginBottom: 4 }}>
                        <span style={{ color: 'var(--danger)' }}>It costs you:</span>{' '}
                        {describe(acqResult.offer.playersOut, acqResult.offer.picksOut)}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--dim)', marginBottom: 10 }}>
                        You give {acqResult.costValue} for {acqResult.returnValue} value
                      </div>
                      <button className="btn small" disabled={!canTrade} onClick={() => executeFinder(acqResult)}>
                        Propose &amp; Execute
                      </button>
                    </div>
                  ) : (
                    <div className="card">
                      <p className="empty">
                        Your roster and picks aren't enough to land this player. Build up assets first.
                      </p>
                    </div>
                  )
                )}
              </>
            )}
          </>
        )}

        {view === 'builder' && (
        <>
        <div className="card">
          <h2>Trade Partner</h2>
          <div className="field">
            <select
              value={partnerId}
              onChange={(e) => {
                setPartnerId(Number(e.target.value));
                reset();
              }}
            >
              {league.teams
                .filter((t) => t.id !== league.userTeamId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.city} {t.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--dim)' }}>
              You send: <b style={{ color: 'var(--text)' }}>{totalGive}</b> value
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--dim)' }}>
              You get: <b style={{ color: 'var(--text)' }}>{totalGet}</b> value
            </span>
          </div>
          {verdict && (
            <p style={{ marginTop: 10, fontSize: '0.88rem', fontWeight: 600 }}>{verdict}</p>
          )}
          <div className="btnrow">
            <button className="btn secondary" onClick={reset}>
              Clear
            </button>
            <button className="btn" onClick={propose} disabled={!canTrade}>
              Propose Trade
            </button>
          </div>
        </div>

        <Seg<'give' | 'get'>
          options={[
            { key: 'give', label: `You Send (${give.size + givePicks.size})` },
            { key: 'get', label: `${partner.abbr} Sends (${get_.size + getPicks.size})` },
          ]}
          value={tab}
          onChange={setTab}
        />

        <div className="card">
          <h2>
            <span className="row" style={{ gap: 6 }}>
              <TeamDot team={side} size={20} /> {side.abbr} Draft Picks
            </span>
          </h2>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {[...side.draftPicks]
              .sort((a, b) => a.season - b.season || a.round - b.round)
              .map((pk) => {
                const key = pkKey(pk);
                const sel = sidePicksSel.has(key);
                return (
                  <button
                    key={key}
                    className={`btn small ${sel ? '' : 'secondary'}`}
                    onClick={() => togglePick(sidePicksSel, sideSetPicks, key)}
                  >
                    {pickLabel(league, pk)}
                  </button>
                );
              })}
          </div>
        </div>

        <div className="card">
          <h2>{side.abbr} Players</h2>
          {side.playerIds
            .map((id) => league.players[id])
            .filter(Boolean)
            .sort((a, b) => b.overall - a.overall)
            .slice(0, 30)
            .map((p) => {
              const sel = sideSel.has(p.id);
              return (
                <div key={p.id} className="list-item" onClick={() => toggle(sideSel, sideSetSel, p.id)}>
                  <PlayerHeadshot player={p} colors={side.colors} size={38} />
                  <span className="pos-badge">{p.pos}</span>
                  <div className="grow">
                    <div className="name">
                      {sel ? '✅ ' : ''}
                      {p.firstName} {p.lastName}
                    </div>
                    <div className="meta">
                      {p.overall} OVR · {p.age}y · {p.contract ? `$${p.contract.salary}M×${p.contract.yearsLeft}yr` : 'No deal'} · val {playerTradeValue(p)}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
        </>
        )}
      </div>
    </>
  );
}
