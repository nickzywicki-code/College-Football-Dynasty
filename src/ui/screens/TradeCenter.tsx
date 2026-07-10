// Trade center: build player+pick packages, get AI verdicts, execute.

import { useMemo, useState } from 'react';
import { useLeague, useStore } from '../../store/store';
import { Seg, TeamDot, TopBar } from '../components';
import type { DraftPickAsset, TradeOffer } from '../../engine/types';
import { evaluateTrade, executeTrade, playerTradeValue, pickTradeValue } from '../../engine/franchise/trades';

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

  const me = league.teams[league.userTeamId];
  const partner = league.teams[partnerId];
  const canTrade = league.phase === 'regularSeason' || league.phase === 'draft' || league.phase === 'freeAgency';

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
                  <span className="pos-badge">{p.pos}</span>
                  <div className="grow">
                    <div className="name">
                      {sel ? '✅ ' : ''}
                      {p.firstName} {p.lastName}
                    </div>
                    <div className="meta">
                      {p.overall} OVR · {p.age}y · value {playerTradeValue(p)}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </>
  );
}
