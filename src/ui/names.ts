import type { Color } from '../core/eval';
import { t } from '../i18n';

/** Names shared by several screens, in the current language. */
export const sideName = (c: Color): string => t(c === 'white' ? 'common.white' : 'common.black');
export const sideLower = (c: Color): string => t(c === 'white' ? 'common.whiteLower' : 'common.blackLower');

const SPEEDS = ['ultraBullet', 'bullet', 'blitz', 'rapid', 'classical', 'correspondence', 'daily'] as const;
/** "blitz", "rapide"…: the speed of a game as written by Lichess or Chess.com. */
export function speedName(speed: string): string {
  return (SPEEDS as readonly string[]).includes(speed) ? t(`speed.${speed as (typeof SPEEDS)[number]}`) : speed;
}
