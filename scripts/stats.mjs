export {arStats} from "../profile-stats.mjs";
export function nextMidnight(now = Date.now()) {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+1);
}
