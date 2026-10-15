// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+): what a scene can make
// a LaMetric do that a device feature cannot carry.
//
//   - show_notification: a text, with an icon of the LaMetric gallery, a
//     sound, a priority, a number of passes and a duration. The fields arrive
//     resolved: `{{...}}` scene variables are already in the text;
//   - start_timer: the timer app, for a duration chosen in the scene.
//
// Both act on the chosen clock, or on every clock that answers when the
// device field is left empty. Throwing fails the action only: the scene logs
// it and goes on. The keys are permanent once published.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { parseWhole } from './lametric/model.js';

const logger = createLogger({ name: 'scenes' });

export const SCENE_ACTION_KEYS = Object.freeze({
  SHOW: 'show_notification',
  TIMER: 'start_timer',
});

export const MAX_TIMER_MINUTES = 1440;

export const SCENE_ACTIONS = {
  async [SCENE_ACTION_KEYS.SHOW](hub, { fields }) {
    logger.debug('Scene action show_notification');
    const { count } = await hub.notify(fields.device || null, fields);
    return { count };
  },

  async [SCENE_ACTION_KEYS.TIMER](hub, { fields }) {
    const minutes = parseWhole(fields.minutes, { min: 0, max: MAX_TIMER_MINUTES, fallback: 0 });
    const seconds = parseWhole(fields.seconds, { min: 0, max: 59, fallback: 0 });
    // A zero duration starts nothing: one second at least.
    const total = Math.max(1, minutes * 60 + seconds);
    logger.debug(`Scene action start_timer (${total} s)`);
    const { count } = await hub.startTimer(fields.device || null, total);
    return { count };
  },
};
