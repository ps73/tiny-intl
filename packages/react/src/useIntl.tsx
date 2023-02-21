/* eslint-disable react-hooks/exhaustive-deps */
import type { TinyIntl } from '../../core/lib/types';

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
  const d = useCallback(intl.d, [changed]);

  useEffect(() => {
    const dispose = intl.subscribe(() => {
      setChanged((prev) => prev + 1);
    });
    return dispose;
  }, [intl]);

  return {
    t,
    tc,
    n,
    d,
    change: intl.change,
  };
}
