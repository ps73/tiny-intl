import type { TinyIntlTranslateTemplate } from '@tiny-intl/core';
import type { JSX } from 'solid-js';

import { Show, createEffect, createMemo, createSignal, onCleanup, useContext } from 'solid-js';

import { TinyIntlContext } from './useIntl';

export type TranslateProps = {
  children?: (value: string | null) => JSX.Element;
} & (
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
    }
);

export function Translate(props: TranslateProps) {
  const intl = useContext(TinyIntlContext);

  if (!intl) {
    throw new Error('useIntl must be used within a TinyIntlContext.Provider');
  }

  const { subscribe, t, tc, d, n } = intl;

  const [changed, setChanged] = createSignal(0);

  const translateFn = createMemo(
    () => {
      changed();

      if (props.count) {
        return tc(props.name, props.count, props.options);
      }

      if (props.date) {
        return d(props.date, props.options);
      }

      if (props.number) {
        return n(props.number, props.options);
      }

      if (props.name) {
        return t(props.name, props.options);
      }

      return null;
    },
    null,
    {
      equals: (a, b) => a === b,
    },
  );

  createEffect(() => {
    const dispose = subscribe(() => {
      setChanged((prev) => prev + 1);
    });
    onCleanup(() => {
      dispose();
    });
  });

  return (
    <Show
      when={typeof props.children === 'function' && props.children}
      keyed
      fallback={translateFn()}
    >
      {(childFn) => childFn(translateFn())}
    </Show>
  );
}

export const Trans = Translate;
