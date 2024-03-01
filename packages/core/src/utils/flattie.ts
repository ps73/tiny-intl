/**
 * Flattie from https://github.com/lukeed/flattie
 * @author lukeed
 * @license MIT
 */

function iter(
  output: Record<string, any>,
  nullish: boolean,
  sep: string,
  val: unknown,
  key: string,
) {
  let k;
  const pfx = key ? key + sep : key;
  const nextOutput = output;

  if (val == null) {
    if (nullish) nextOutput[key] = val;
  } else if (typeof val !== 'object') {
    nextOutput[key] = val;
  } else if (Array.isArray(val)) {
    for (k = 0; k < val.length; k += 1) {
      iter(output, nullish, sep, val[k], pfx + k.toString());
    }
  } else {
    // eslint-disable-next-line guard-for-in, no-restricted-syntax
    for (k in val) {
      iter(output, nullish, sep, (val as Record<string, any>)[k], pfx + k.toString());
    }
  }
}

export function flattie<X extends Record<string, any>, Y = unknown>(
  input: Y,
  glue?: string,
  keepNullish?: boolean,
): X {
  const output = {};
  if (typeof input === 'object') {
    iter(output, !!keepNullish, glue || '.', input, '');
  }
  return output as X;
}
