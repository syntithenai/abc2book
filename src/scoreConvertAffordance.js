import { useEffect, useState } from 'react';
import {
  affordanceForOperation,
  checkCanAfford,
  formatEstimateCents,
} from './creditAffordabilityClient';

/**
 * Load billing affordance for a hosted score-convert operation.
 * Returns { loading, affordance, estimateLabel, blocked, error }.
 */
export function useScoreConvertAffordance(accessToken, operationId, enabled) {
  const [state, setState] = useState({
    loading: false,
    affordance: null,
    estimateLabel: '',
    blocked: false,
    error: '',
  });

  useEffect(function() {
    if (!enabled || !accessToken || !operationId) {
      setState({
        loading: false,
        affordance: null,
        estimateLabel: '',
        blocked: false,
        error: '',
      });
      return;
    }

    let cancelled = false;
    setState(function(prev) {
      return Object.assign({}, prev, { loading: true, error: '' });
    });

    checkCanAfford(accessToken, [{ id: operationId }])
      .then(function(body) {
        if (cancelled) return;
        const affordance = affordanceForOperation(body, operationId);
        const estimateLabel = affordance && affordance.estimateCents != null
          ? formatEstimateCents(affordance.estimateCents)
          : '';
        setState({
          loading: false,
          affordance: affordance,
          estimateLabel: estimateLabel,
          blocked: !!(affordance && affordance.affordable === false),
          error: '',
        });
      })
      .catch(function(err) {
        if (cancelled) return;
        setState({
          loading: false,
          affordance: null,
          estimateLabel: '',
          blocked: false,
          error: (err && err.message) || 'Could not check resolver credit',
        });
      });

    return function() {
      cancelled = true;
    };
  }, [accessToken, operationId, enabled]);

  return state;
}

export function scoreConvertCreditMessage(affordanceState, operationLabel) {
  const state = affordanceState || {};
  if (state.loading) {
    return 'Checking resolver credit…';
  }
  if (state.blocked) {
    const shortfall = state.affordance && state.affordance.shortfallCents != null
      ? formatEstimateCents(state.affordance.shortfallCents)
      : '';
    return (
      'Insufficient resolver credit'
      + (shortfall ? ' (need ' + shortfall + ' more)' : '')
      + ' for ' + (operationLabel || 'this import') + '. Buy credit in Settings → Billing.'
    );
  }
  if (state.estimateLabel) {
    return 'Hosted ' + (operationLabel || 'conversion') + ' uses about ' + state.estimateLabel + ' of resolver credit.';
  }
  return '';
}
