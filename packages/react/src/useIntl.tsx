/* eslint-disable react-hooks/exhaustive-deps */
import type { TinyIntl } from '@tiny-intl/core';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export const TinyIntlContext = createContext<TinyIntl<string> | undefined>(undefined);

export function useIntl() {
  const intl = useContext(TinyIntlContext);

  if (!intl) {
    throw new Error('useIntl must be used within a TinyIntlContext.Provider');
  }

  const [changed, setChanged] = useState(0);

  const t = useCallback(intl.t, [changed]);
  const tc = useCallback(intl.tc, [changed]);
  const n = useCallback(intl.n, [changed]);
  const dt = useCallback(intl.dt, [changed]);
  const rt = useCallback(intl.rt, [changed]);
  const sort = useCallback(intl.sort, [changed]);
  const collator = useCallback(intl.collator, [changed]);
  const list = useCallback(intl.list, [changed]);

  useEffect(() => {
    const dispose = intl.subscribe(() => {
      setChanged((prev) => prev + 1);
    });
    return dispose;
  }, [intl]);

  return {
    ...intl,
    t,
    tc,
    n,
    /**
     * @deprecated use dt instead. Will be removed in stable release.
     */
    d: dt,
    dt,
    rt,
    sort,
    collator,
    list,
    change: intl.change,
  };
}
