import React from 'react';
import StatisticBox, { STATISTIC_ORDER } from 'Interface/Others/StatisticBox';
import SpellIcon from 'common/SpellIcon';
import { formatPercentage, formatNumber } from 'common/format';

import SPELLS from 'common/SPELLS';
import ITEMS from 'common/ITEMS';
import Analyzer from 'Parser/Core/Analyzer';
import { ABILITIES_THAT_TRIGGER_ENDURING_RENEWAL } from '../../Constants';

class EnduringRenewal extends Analyzer {
  _normalRenewDropoff = {};
  _newRenewDropoff = {};
  healing = 0;
  refreshedRenews = 0;
  secsGained = 0;

  // This module will be tracking the initial application of renews, then recording
  // all renew healing done to those targets after a timestamp + base duration at
  // applybuff since all "refreshbuff" events for renew will be from direct heals
  // (the exception would be benediction renews refreshing but I'm not sure how to
  // counter that and it should be such a small portion of refreshs anyway). Thus,
  // all renew healing after timestamp + baase duraation should be a result of
  // Enduring Renewal

  constructor(...args) {
    super(...args);
    this.active = this.selectedCombatant.hasTalent(SPELLS.ENDURING_RENEWAL_TALENT.id);
    this._usingLegendaryLegs = this.selectedCombatant.hasLegs(ITEMS.ENTRANCING_TROUSERS_OF_ANJUNA.id);
    this._baseRenewLength = 15 + (this._usingLegendaryLegs ? 6 : 0);
  }

  // We do not track "casts" of Renew because casting Renew on an existing target
  // that has renew is also a "direct heal" that triggers Enduring Renewal.
  // It is up for debate whether or not direct heals from Renew should attribute
  // to Enduring Renewal, but for now I will say it does.
  on_byPlayer_applybuff(event) {
    this.parseRenew(event); // function incase we decide to disclude manual renew refreshes
  }

  on_byPlayer_removebuff(event) {
    const spellId = event.ability.guid;
    if (spellId !== SPELLS.RENEW.id) {
      return;
    }
    delete this._normalRenewDropoff[event.targetID];
    delete this._newRenewDropoff[event.targetID];
  }

  on_byPlayer_heal(event) {
    const spellId = event.ability.guid;
    if (spellId === SPELLS.RENEW.id) {
      if (this._normalRenewDropoff[event.targetID] !== undefined && event.timestamp > this._normalRenewDropoff[event.targetID]) {
        this.healing += event.amount;
      }
    } else if (ABILITIES_THAT_TRIGGER_ENDURING_RENEWAL.includes(spellId)) {
      if (this._newRenewDropoff[event.targetID] !== undefined) {
        const remaining = (this._newRenewDropoff[event.targetID] - event.timestamp) / 1000.0;
        const gain = Math.min((this._baseRenewLength + 6) - remaining, this._baseRenewLength); // be wary of pandemic but also wary of early refreshes
        this._newRenewDropoff[event.targetID] = event.timestamp + (gain * 1000);

        this.refreshedRenews += 1;
        this.secsGained += gain;
      }
    }
  }

  parseRenew(event) {
    const spellId = event.ability.guid;
    if (spellId === SPELLS.RENEW.id) {
      this._normalRenewDropoff[event.targetID] = event.timestamp + this._baseRenewLength * 1000;
      this._newRenewDropoff[event.targetID] = event.timestamp + this._baseRenewLength * 1000;
    }
  }


  statistic() {
    const erPercHPS = formatPercentage(this.owner.getPercentageOfTotalHealingDone(this.healing));
    const erHPS = formatNumber(this.healing / this.owner.fightDuration * 1000);
    const erGainPerRefresh = Math.round(this.secsGained / this.refreshedRenews * 100) / 100;

    //
    return this.active && (
      <StatisticBox
        icon={<SpellIcon id={SPELLS.ENDURING_RENEWAL_TALENT.id} />}
        value={`${erHPS} HPS`}
        label={(
          <dfn data-tip={`
            Healing done on targets as a result of Enduring Renewal's refresh.
            This did ${formatNumber(this.healing)} healing and was ${erPercHPS}% of your total healing.
            <br/><br/>
            You refreshed renews ${this.refreshedRenews} times for a total of ${formatNumber(this.secsGained)} additional seconds of Renew.
            (+${erGainPerRefresh}s per refresh on average).
          `}
          >
            Enduring Renewal
          </dfn>
        )}
      />
    );
    //
  }

  statisticOrder = STATISTIC_ORDER.OPTIONAL(1);
}


export default EnduringRenewal;
