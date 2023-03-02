/* eslint-disable react-hooks/exhaustive-deps */
import type { TinyIntlTranslateTemplate } from '../../core/lib/types';

import { useCallback, useContext, useEffect, useState } from 'react';

import { TinyIntlContext } from './useIntl';

export type TranslateProps =
  | {
      name: string;
      count?: number;
      date?: undefined;
      number?: undefined;
      options?: TinyIntlTranslateTemplate;
    }
  | {
      name?: undefined;
      count?: undefined;
      data?: undefined;
      date?: Date | string | number;
      number?: undefined;
      options?: Intl.DateTimeFormatOptions;
    }
  | {
      name?: undefined;
      count?: undefined;
      data?: undefined;
      date?: undefined;
      number?: number;
      options?: Intl.NumberFormatOptions;
    };

export function Translate(props: TranslateProps) {
  const intl = useContext(TinyIntlContext);

  if (!intl) {
    throw new Error('useIntl must be used within a intlContext.Provider');
  }

  const { subscribe, t, tc, d, n } = intl;
  const { name, count, date, number, options } = props; // eslint-disable-line no-shadow

  const [changed, setChanged] = useState(0);

  const translateFn = useCallback(() => {
    if (count) {
      return tc(name, count, options);
    }

    if (date) {
      return d(date, options);
    }

    if (number) {
      return n(number, options);
    }

    if (name) {
      return t(name, options);
    }

    return null;
  }, [changed, count, date, name, number, options]);

  useEffect(() => {
    const dispose = subscribe(() => {
      setChanged((prev) => prev + 1);
    });
    return dispose;
  }, [intl]);

  return <>{translateFn()}</>;
}

export const Trans = Translate;
