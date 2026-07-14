window.NWKS = window.NWKS || {};

/* Transition registry.
   Contract (owned by transitions-coder per module; full detail + rationale in
   src/js/transition-core.js, which every module is validated against):
   NWKS.transitions['<id>'] = {
     id, label, door: 'men'|'women',
     run(coverEl, ctx) => Promise<void>
       // ctx = { dir:'enter'|'exit', door, reduced, cover(), swap(), uncover() }
       // animates coverEl to FULLY cover the screen, calls ctx.swap() at the
       // covered midpoint (the only sanctioned DOM swap), then uncovers and
       // resolves. Must handle both dir values. Target: ~600-800ms total.
   };
*/
NWKS.transitions = NWKS.transitions || {};

NWKS.registry = {
  // Which concept is active for a given door. Defaults chosen away from the
  // geometric shatter (operator disliked it): Men's = Dawn, Women's = Fireflies.
  // The concept switcher lets the operator flip through all registered options.
  _active: { men: 'men-banner', women: 'women-banner' },

  getActive: function (door) {
    if (this._active[door]) return this._active[door];
    return door === 'women' ? 'women-banner' : 'men-banner';
  },

  setActive: function (door, id) {
    this._active[door] = id;
  },

  // All registered transition ids for a door, in registration order.
  list: function (door) {
    var ids = [];
    for (var id in NWKS.transitions) {
      if (Object.prototype.hasOwnProperty.call(NWKS.transitions, id) && NWKS.transitions[id].door === door) {
        ids.push(id);
      }
    }
    return ids;
  }
};
