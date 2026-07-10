// Free agency: browse pool, make offers, advance days, watch AI signings.

import { useMemo, useState } from 'react';
import { useLeague, useStore } from '../../store/store';
import { Modal, TopBar } from '../components';
import { POSITIONS, Position, FA_DAYS } from '../../engine/types';
import { freeAgents } from '../../engine/franchise/freeAgency';
import { askingPrice, capRoom } from '../../engine/franchise/contracts';

export function FreeAgencyScreen() {
  const league = useLeague();
  useStore((s) => s.rev);
  const navigate = useStore((s) => s.navigate);
  const advanceFaDay = useStore((s) => s.advanceFaDay);
  const makeFaOffer = useStore((s) => s.makeFaOffer);
  const [posFilter, setPosFilter] = useState<Position | 'ALL'>('ALL');
  const [offerId, setOfferId] = useState<number | null>(null);
  const [salary, setSalary] = useState('5');
  const [years, setYears] = useState('2');
  const [result, setResult] = useState<string | null>(null);

  const fa = league.freeAgency;
  const team = league.teams[league.userTeamId];
  const room = capRoom(league, team);
  const seasonStarted = league.phase === 'regularSeason';

  const pool = useMemo(
    () =>
      freeAgents(league)
        .filter((p) => posFilter === 'ALL' || p.pos === posFilter)
        .slice(0, 80),
    [league, posFilter, fa?.day],
  );
  const offerTarget = offerId != null ? league.players[offerId] : null;

  const submitOffer = () => {
    if (!offerTarget) return;
    const sal = parseFloat(salary);
    const yrs = parseInt(years, 10);
    if (isNaN(sal) || sal <= 0 || isNaN(yrs) || yrs < 1) {
      setResult('Enter a valid salary and years.');
      return;
    }
    if (sal > room) {
      setResult(`Over the cap — you have $${room}M of room.`);
      return;
    }
    const ok = makeFaOffer(offerTarget.id, sal, yrs);
    setResult(
      ok
        ? `✅ ${offerTarget.lastName} signs for $${sal}M × ${yrs}yr!`
        : `❌ ${offerTarget.lastName} declined. He's asking around $${askingPrice(offerTarget)}M.`,
    );
    if (ok) setOfferId(null);
  };

  return (
    <>
      <TopBar
        title="Free Agency"
        sub={
          seasonStarted
            ? 'In-season signings'
            : fa
              ? `Day ${Math.min(fa.day, FA_DAYS)} of ${FA_DAYS} · $${room}M cap room`
              : `$${room}M cap room`
        }
        back
      />
      <div className="screen">
        {fa && !fa.complete && (
          <div className="card">
            <button className="btn warn" onClick={advanceFaDay}>
              {fa.day >= FA_DAYS ? '🏁 Finish Free Agency → New Season' : `⏩ Advance to Day ${fa.day + 1}`}
            </button>
            <p style={{ fontSize: '0.76rem', color: 'var(--dim)', marginTop: 8 }}>
              AI teams sign players each day. Stars go early — bargains appear late.
            </p>
          </div>
        )}

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
          <h2>Available Players ({pool.length})</h2>
          {pool.map((p) => (
            <div key={p.id} className="list-item">
              <span className="pos-badge">{p.pos}</span>
              <div className="grow" onClick={() => navigate('player', { playerId: p.id })}>
                <div className="name">
                  {p.firstName} {p.lastName}
                </div>
                <div className="meta">
                  {p.overall} OVR · {p.age}y · asks ~${askingPrice(p)}M
                </div>
              </div>
              <button
                className="btn small"
                onClick={() => {
                  setOfferId(p.id);
                  setSalary(String(askingPrice(p)));
                  setYears('2');
                  setResult(null);
                }}
              >
                Offer
              </button>
            </div>
          ))}
          {pool.length === 0 && <p className="empty">Nobody left at this position.</p>}
        </div>

        {fa && fa.log.length > 0 && (
          <div className="card news">
            <h2>Signings</h2>
            {fa.log.slice(0, 12).map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
        )}
      </div>

      {offerTarget && (
        <Modal onClose={() => setOfferId(null)}>
          <h3>
            Offer: {offerTarget.pos} {offerTarget.firstName} {offerTarget.lastName} ({offerTarget.overall} OVR)
          </h3>
          <div className="field">
            <label>Salary ($M per year) — asking ~${askingPrice(offerTarget)}M</label>
            <input
              type="number"
              inputMode="decimal"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Years</label>
            <select value={years} onChange={(e) => setYears(e.target.value)}>
              {[1, 2, 3, 4, 5].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          {result && <p style={{ fontSize: '0.85rem', marginBottom: 10 }}>{result}</p>}
          <div className="btnrow">
            <button className="btn secondary" onClick={() => setOfferId(null)}>
              Cancel
            </button>
            <button className="btn" onClick={submitOffer}>
              Submit Offer
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
