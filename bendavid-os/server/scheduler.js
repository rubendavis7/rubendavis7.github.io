'use strict';
// Scheduled execution (automation readiness). Schedules live in the database
// settings and every one starts DISABLED. When enabled, a schedule fires at
// most once per day, only within 60 minutes after its time (America/New_York),
// and only while this computer is on and BenDavid OS is running. Scheduled
// runs may only use saved-data/template engines.

const { HttpError } = require('./store');

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const CATCH_UP_MINUTES = 60;

class Scheduler {
  constructor({ store, runs, registry, clock, tickMs = 30000 }) {
    Object.assign(this, { store, runs, registry, clock, tickMs });
    this.timer = null;
  }

  start() {
    this.timer = setInterval(() => { this.tick().catch((err) => console.error('[scheduler]', err.message)); }, this.tickMs);
    if (this.timer.unref) this.timer.unref();
  }

  stop() { clearInterval(this.timer); }

  async tick(now = this.clock.now()) {
    const p = this.clock.parts(now);
    const fired = [];
    for (const s of this.store.data.settings.schedules) {
      if (!s.enabled || !s.days.includes(p.weekday) || s.lastFiredDate === p.date) continue;
      const [h, m] = s.time.split(':').map(Number);
      const late = p.hour * 60 + p.minute - (h * 60 + m);
      if (late < 0 || late > CATCH_UP_MINUTES) continue;
      let result;
      try {
        const { run } = await this.runs.start({ workflowId: s.workflowId, inputs: {}, trigger: 'schedule', client: 'scheduler', requestId: `sched-${s.workflowId}-${p.date}` });
        result = { lastRunId: run.id, lastResult: `started ${run.id}` };
      } catch (err) {
        result = { lastResult: `could not start: ${err.message}` };
      }
      this.store.updateSettings((st) => {
        const target = st.schedules.find((x) => x.workflowId === s.workflowId);
        Object.assign(target, { lastFiredDate: p.date, lastFiredAt: new Date(now).toISOString(), ...result });
      }, `Schedule for ${s.workflowId} fired at ${p.time} ${this.clock.tz}: ${result.lastResult}`);
      fired.push(s.workflowId);
    }
    return fired;
  }

  update(workflowId, { enabled, time, days }) {
    const def = this.registry.get(workflowId);
    if (!def.schedulable) throw new HttpError(400, `${def.name} cannot be scheduled`);
    const s = this.store.data.settings.schedules.find((x) => x.workflowId === workflowId);
    if (!s) throw new HttpError(404, 'No schedule for that workflow');
    const next = {};
    if (enabled !== undefined) {
      if (typeof enabled !== 'boolean') throw new HttpError(400, 'enabled must be true or false');
      next.enabled = enabled;
    }
    if (time !== undefined) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new HttpError(400, 'Time must look like 07:45');
      next.time = time;
    }
    if (days !== undefined) {
      if (!Array.isArray(days) || !days.length || days.some((d) => !DAYS.includes(d))) throw new HttpError(400, `Days must be a list of: ${DAYS.join(', ')}`);
      next.days = DAYS.filter((d) => days.includes(d));
    }
    this.store.updateSettings((st) => {
      Object.assign(st.schedules.find((x) => x.workflowId === workflowId), next);
    }, `Schedule for ${def.name} updated: ${next.enabled === undefined ? '' : next.enabled ? 'ON ' : 'OFF '}${next.time || ''} ${next.days ? next.days.join(',') : ''}`.trim());
    return this.store.data.settings.schedules.find((x) => x.workflowId === workflowId);
  }
}

module.exports = { Scheduler, DAYS };
