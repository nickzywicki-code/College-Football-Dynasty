// Player profile: ratings, contract, per-season stats, awards, actions.

import { useMemo, useState } from 'react';
import { useLeague, useStore } from '../../store/store';
import { Modal, PlayerModel, RatingBar, TopBar, ovrClass } from '../components';
import type { AttrKey, Player, SeasonStats } from '../../engine/types';
import { releasePlayer, askingPrice, offerAccepted, signPlayer, capRoom } from '../../engine/franchise/contracts';
import { runtimeRng } from '../../store/store';

const ATTR_LABELS: { key: AttrKey; label: string; for?: string[] }[] = [
  { key: 'spd', label: 'Speed' },
  { key: 'acc', label: 'Acceleration' },
  { key: 'agi', label: 'Agility' },
  { key: 'str', label: 'Strength' },
  { key: 'thp', label: 'Throw Power', for: ['QB'] },
  { key: 'tha', label: 'Throw Accuracy', for: ['QB'] },
  { key: 'cth', label: 'Catching', for: ['RB', 'WR', 'TE'] },
  { key: 'car', label: 'Carry Security', for: ['QB', 'RB', 'WR', 'TE'] },
  { key: 'blk', label: 'Blocking', for: ['OL', 'TE', 'RB'] },
  { key: 'tkl', label: 'Tackling', for: ['DL', 'LB', 'CB', 'S'] },
  { key: 'cov', label: 'Coverage', for: ['LB', 'CB', 'S'] },
  { key: 'kck', label: 'Kicking', for: ['K', 'P'] },
  { key: 'sta', label: 'Stamina' },
  { key: 'awr', label: 'Awareness' },
];

function statCols(p: Player): { label: string; get: (s: SeasonStats) => string }[] {
  switch (p.pos) {
    case 'QB':
      return [
        { label: 'CMP/ATT', get: (s) => `${s.passCmp}/${s.passAtt}` },
        { label: 'YDS', get: (s) => `${s.passYds}` },
        { label: 'TD', get: (s) => `${s.passTd}` },
        { label: 'INT', get: (s) => `${s.passInt}` },
        { label: 'RUSH', get: (s) => `${s.rushYds}` },
      ];
    case 'RB':
      return [
        { label: 'ATT', get: (s) => `${s.rushAtt}` },
        { label: 'YDS', get: (s) => `${s.rushYds}` },
        { label: 'TD', get: (s) => `${s.rushTd}` },
        { label: 'REC', get: (s) => `${s.rec}` },
        { label: 'RECYD', get: (s) => `${s.recYds}` },
      ];
    case 'WR':
    case 'TE':
      return [
        { label: 'REC', get: (s) => `${s.rec}` },
        { label: 'TGT', get: (s) => `${s.targets}` },
        { label: 'YDS', get: (s) => `${s.recYds}` },
        { label: 'TD', get: (s) => `${s.recTd}` },
      ];
    case 'K':
      return [
        { label: 'FG', get: (s) => `${s.fgm}/${s.fga}` },
        { label: 'LONG', get: (s) => `${s.fgLong}` },
        { label: 'XP', get: (s) => `${s.xpm}/${s.xpa}` },
      ];
    case 'P':
      return [
        { label: 'PUNTS', get: (s) => `${s.punts}` },
        { label: 'AVG', get: (s) => (s.punts ? (s.puntYds / s.punts).toFixed(1) : '0') },
      ];
    default:
      return [
        { label: 'TKL', get: (s) => `${s.tackles}` },
        { label: 'SACK', get: (s) => `${s.sacks}` },
        { label: 'INT', get: (s) => `${s.defInt}` },
        { label: 'FF', get: (s) => `${s.forcedFum}` },
      ];
  }
}

export function PlayerView() {
  const league = useLeague();
  useStore((s) => s.rev);
  const nav = useStore((s) => s.nav);
  const touch = useStore((s) => s.touch);
  const persist = useStore((s) => s.persist);
  const back = useStore((s) => s.back);
  const playerId = nav[nav.length - 1].params?.playerId ?? -1;
  const p = league.players[playerId];
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [extendMsg, setExtendMsg] = useState<string | null>(null);

  const team = p && p.teamId >= 0 ? league.teams[p.teamId] : null;
  const isMine = p?.teamId === league.userTeamId;
  const cols = useMemo(() => (p ? statCols(p) : []), [p]);

  if (!p) return <div className="screen empty">Player not found.</div>;

  const relevantAttrs = ATTR_LABELS.filter((a) => !a.for || a.for.includes(p.pos));
  const ask = askingPrice(p);
  const canExtend = isMine && p.contract && p.contract.yearsLeft <= 1;

  const doExtend = () => {
    const userTeam = league.teams[league.userTeamId];
    const salary = Math.round(ask * 10) / 10;
    if (salary > capRoom(league, userTeam) + (p.contract?.salary ?? 0)) {
      setExtendMsg('Not enough cap room for this extension.');
      return;
    }
    const years = p.age >= 30 ? 2 : 3;
    if (offerAccepted(runtimeRng, p, salary, years)) {
      signPlayer(league, userTeam, p, salary, years);
      setExtendMsg(`Extended: $${salary}M × ${years} years.`);
    } else {
      setExtendMsg(`${p.lastName} rejected the offer — he wants more than $${salary}M.`);
    }
    touch();
    persist();
  };

  return (
    <>
      <TopBar title={`${p.firstName} ${p.lastName}`} sub={`${p.pos} · ${team?.abbr ?? 'FA'}`} back />
      <div className="screen">
        <div className="card">
          <div className="row">
            <PlayerModel
              player={p}
              colors={team ? team.colors : ['#3a3f5a', '#8b93a8']}
              size={76}
            />
            <span className={ovrClass(p.overall)} style={{ fontSize: '1.3rem', minWidth: 48, padding: '8px 0' }}>
              {p.overall}
            </span>
            <div className="grow">
              <div style={{ fontWeight: 700 }}>
                {p.age} years old · {p.yearsPro} yr pro
                {p.injuryWeeks > 0 && (
                  <span style={{ color: 'var(--danger)' }}> · Injured {p.injuryWeeks}w</span>
                )}
              </div>
              <div style={{ color: 'var(--dim)', fontSize: '0.8rem', marginTop: 2 }}>
                {p.contract ? `$${p.contract.salary}M/yr · ${p.contract.yearsLeft} yr left` : 'Free agent'}
                {p.draftInfo
                  ? ` · Drafted S${p.draftInfo.season} R${p.draftInfo.round}P${p.draftInfo.pick}`
                  : ' · Undrafted'}
              </div>
            </div>
          </div>
          {p.awards.length > 0 && (
            <div style={{ marginTop: 10, fontSize: '0.78rem', color: 'var(--accent2)' }}>
              🏅 {p.awards.join(' · ')}
            </div>
          )}
        </div>

        <div className="card">
          <h2>Ratings</h2>
          {relevantAttrs.map((a) => (
            <RatingBar key={a.key} label={a.label} value={p.attrs[a.key]} />
          ))}
        </div>

        {p.stats.length > 0 && (
          <div className="card">
            <h2>Career Stats</h2>
            <div className="tblwrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>SEA</th>
                    <th>GP</th>
                    {cols.map((c) => (
                      <th key={c.label}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...p.stats].reverse().map((s) => (
                    <tr key={s.season}>
                      <td>
                        S{s.season} {s.teamAbbr}
                      </td>
                      <td>{s.gamesPlayed}</td>
                      {cols.map((c) => (
                        <td key={c.label}>{c.get(s)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {isMine && (
          <div className="card">
            <h2>Manage</h2>
            {canExtend && (
              <button className="btn warn" onClick={doExtend} style={{ marginBottom: 10 }}>
                ✍️ Offer Extension (~${ask}M/yr)
              </button>
            )}
            {extendMsg && <p style={{ fontSize: '0.82rem', color: 'var(--dim)', marginBottom: 10 }}>{extendMsg}</p>}
            <button className="btn danger" onClick={() => setConfirmRelease(true)}>
              Release Player
            </button>
          </div>
        )}
      </div>

      {confirmRelease && (
        <Modal onClose={() => setConfirmRelease(false)}>
          <h3>
            Release {p.firstName} {p.lastName}?
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--dim)', marginBottom: 14 }}>
            He becomes a free agent immediately. His ${p.contract?.salary}M salary comes off your books.
          </p>
          <div className="btnrow">
            <button className="btn secondary" onClick={() => setConfirmRelease(false)}>
              Cancel
            </button>
            <button
              className="btn danger"
              onClick={() => {
                releasePlayer(league, league.teams[league.userTeamId], p);
                touch();
                persist();
                setConfirmRelease(false);
                back();
              }}
            >
              Release
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
