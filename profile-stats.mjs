export function arStats(player, id='p61') {
  const count = key => {
    const value = player?.[key]?.[id];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  };
  const counters = ['shots_fired_zoomed','shots_fired_unzoomed','shots_hit_zoomed','shots_hit_unzoomed'].map(count);
  if (counters.some(v => v === null)) return {accuracy:null,headshotFrequency:null};
  const [fz,fu,hz,hu] = counters, fired = fz+fu, hits = hz+hu, heads = count('headshots');
  if (hz > fz || hu > fu || !fired) return {accuracy:null,headshotFrequency:null};
  return {accuracy:100*hits/fired,headshotFrequency:hits > 0 && heads !== null && heads <= hits ? 100*heads/hits : null};
}
