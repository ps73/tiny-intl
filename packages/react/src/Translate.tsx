/* eslint-disable react-hooks/exhaustive-deps */
import type { TinyIntlTranslateTemplate } from '../../core/lib/types';

import { useCallback, useContext, useEffect, useState } from 'react';

import { TinyIntlContext } from './useIntl';

export type TranslateProps = {
  children?: (value: string | null) => React.ReactNode;
} & (
  | {
      // Case: string translation
      name: string;
      count?: number;
      date?: undefined;
      number?: undefined;
      options?: TinyIntlTranslateTemplate;
      relative?: undefined;
      unit?: undefined;
    }
  | {
      // Case: dateFormat
      name?: undefined;
      count?: undefined;
      data?: undefined;
      date?: Date | string | number;
      number?: undefined;
      options?: Intl.DateTimeFormatOptions;
      relative?: undefined;
    }
  | {
      // Case: relativeTimeFormat
      name?: undefined;
      count?: undefined;
      data?: undefined;
      date?: Date | string | number;
      number?: undefined;
      options?: Intl.RelativeTimeFormatOptions;
      relative?: true;
    }
  | {
      // Case: numberFormat
      name?: undefined;
      count?: undefined;
      data?: undefined;
      date?: undefined;
      number?: number;
      options?: Intl.NumberFormatOptions;
      relative?: undefined;
    }
);

export function Translate(props: TranslateProps) {
  const intl = useContext(TinyIntlContext);

  if (!intl) {
    throw new Error('useIntl must be used within a TinyIntlContext.Provider');
  }

  const { subscribe, t, tc, dt, n, rt } = intl;
  const { name, count, date, number, options, children, relative } = props; // eslint-disable-line no-shadow

  const [changed, setChanged] = useState(0);

  const translateFn = useCallback(() => {
    if (count) {
      return tc(name, count, options);
    }

    if (date && !relative) {
      return dt(date, options);
    }

    if (date && relative) {
      return rt(date, options);
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

  if (children && typeof children === 'function') {
    return <>{children(translateFn())}</>;
  }

  return <>{translateFn()}</>;
}

export const Trans = Translate;

Translate.defaultProps = {
  children: undefined,
};
