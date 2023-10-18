import type { TinyIntlTranslateTemplate } from '@tiny-intl/core';
import type { JSX } from 'solid-js';

import { Show, createMemo, createSignal, onCleanup, onMount, useContext } from 'solid-js';

import { TinyIntlContext } from './useIntl';

export type TranslateProps = {
  children?: (value: string | null) => JSX.Element;
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

  const [changed, setChanged] = createSignal(0);

  const translateFn = createMemo(
    () => {
      changed();

      if (props.count) {
        return intl.tc(props.name, props.count, props.options);
      }

      if (props.date && !props.relative) {
        return intl.dt(props.date, props.options);
      }

      if (props.date && props.relative) {
        return intl.rt(props.date, props.options);
      }

      if (props.number) {
        return intl.n(props.number, props.options);
      }

      if (props.name) {
        return intl.t(props.name, props.options);
      }

      return null;
    },
    null,
    {
      equals: (a, b) => a === b,
    },
  );

  onMount(() => {
    const dispose = intl.subscribe(() => {
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
