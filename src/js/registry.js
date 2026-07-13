window.NWKS = window.NWKS || {};

/* Transition registry.
   Contract (owned by transitions-coder per module):
   NWKS.transitions['<id>'] = {
     id, label, door: 'men'|'women',
     run(fromPanelEl, toWorldEl, {reduced}) => Promise<void>
       // performs the signature animation and resolves when the world is fully shown
   };
*/
NWKS.transitions = NWKS.transitions || {};

NWKS.registry = {
  // Which concept is active for a given door. Phase 1 default: the recommended
  // concept from each door's variation set (M1 shatter, W1 veil).
  _active: { men: 'men-shatter', women: 'women-veil' },

  getActive: function (door) {
    if (this._active[door]) return this._active[door];
    return door === 'women' ? 'women-veil' : 'men-shatter';
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
