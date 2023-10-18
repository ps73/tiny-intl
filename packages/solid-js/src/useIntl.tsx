/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TinyIntl } from '@tiny-intl/core';
import type { Accessor } from 'solid-js';

import {
  createContext,
  useContext,
  createEffect,
  createSignal,
  createMemo,
  onCleanup,
} from 'solid-js';

export const TinyIntlContext = createContext<TinyIntl<string> | undefined>(undefined);

const memoizeCallback =
  <T extends (...args: any[]) => any>(fn: T, trackDep: () => Accessor<unknown>) =>
  (...args: Parameters<T>): Accessor<ReturnType<T>> => {
    const result = createMemo(
      () => {
        trackDep()();
        return fn.call(args);
      },
      null,
      {
        equals: (a, b) => a === b,
      },
    );
    return result;
  };

export function useIntl() {
  const intl = useContext(TinyIntlContext);

  if (!intl) {
    throw new Error('useIntl must be used within a TinyIntlContext.Provider');
  }

  const [changed, setChanged] = createSignal(0);

  const getLocale = createMemo(
    () => {
      changed();
      return intl.locale;
    },
    '',
    {
      equals: (a, b) => a === b,
    },
  );
  const t = memoizeCallback(intl.t, () => changed);
  const tc = memoizeCallback(intl.tc, () => changed);
  const n = memoizeCallback(intl.n, () => changed);
  const dt = memoizeCallback(intl.dt, () => changed);
  const rt = memoizeCallback(intl.rt, () => changed);
  const sort = memoizeCallback(intl.sort, () => changed);
  const collator = memoizeCallback(intl.collator, () => changed);
  const list = memoizeCallback(intl.list, () => changed);

  createEffect(() => {
    const dispose = intl.subscribe(() => {
      setChanged((prev) => prev + 1);
    });
    onCleanup(() => {
      dispose();
    });
  });

  return {
    ...intl,
    t,
    tc,
    n,
    dt,
    /**
     * @deprecated use dt instead. Will be removed in stable release.
     */
    d: dt,
    rt,
    sort,
    collator,
    list,
    change: intl.change,
    getLocale,
  };
}
